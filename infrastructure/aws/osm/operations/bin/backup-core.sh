#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly CURRENT_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/current-bootstrap.complete"
readonly HISTORY_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/history-bootstrap.complete"

backup_partial=''
backup_path=''
checksum_path=''
manifest_path=''

cleanup_local_backup()
{
    local path

    for path in "${backup_partial}" "${backup_path}" "${checksum_path}" "${manifest_path}"; do
        if [[ -n "${path}" && -e "${path}" ]]; then
            rm --force -- "${path}"
        fi
    done
}

on_error()
{
    local exit_code=$?
    trap - ERR
    cleanup_local_backup || true
    put_metric BackupFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

if [[ ! -f "${CURRENT_BOOTSTRAP_MARKER}" || ! -f "${HISTORY_BOOTSTRAP_MARKER}" ]]; then
    log 'Current and history bootstraps are not both complete; skipping backup'
    exit 0
fi

find "${OSM_BACKUP_PATH}" \
    -xdev \
    -type f \
    -mmin +60 \
    -delete

timestamp="$(date --utc +%Y%m%dT%H%M%SZ)"
backup_name="daf-osm-${DATABASE_NAME}-${timestamp}.dump"
backup_path="${OSM_BACKUP_PATH}/${backup_name}"
backup_partial="${backup_path}.partial"
checksum_path="${backup_path}.sha256"
manifest_path="${backup_path}.json"
object_prefix="${BACKUP_PREFIX%/}/${timestamp}"
archive_key="${object_prefix}/${backup_name}"
checksum_key="${archive_key}.sha256"
manifest_key="${archive_key}.json"

IFS=$'\t' read -r \
    backup_current_sequence \
    backup_history_sequence \
    backup_pre_dump_current_count \
    backup_pre_dump_history_count \
    <<< "$(psql_osm --tuples-only --no-align --field-separator=$'\t' --command="
SELECT
    COALESCE((SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'), '0'),
    COALESCE((SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'), '0'),
    (SELECT count(*) FROM osm_current.alpr_nodes),
    (SELECT count(*) FROM osm_history.alpr_node_versions)
")"
[[ "${backup_current_sequence}" =~ ^[0-9]+$ ]] \
    || die 'Pre-dump backup current sequence is invalid'
[[ "${backup_history_sequence}" =~ ^[0-9]+$ ]] \
    || die 'Pre-dump backup history sequence is invalid'
[[ "${backup_pre_dump_current_count}" =~ ^[0-9]+$ ]] \
    || die 'Pre-dump current ALPR node count is invalid'
[[ "${backup_pre_dump_history_count}" =~ ^[0-9]+$ ]] \
    || die 'Pre-dump history event count is invalid'
readonly \
    backup_current_sequence \
    backup_history_sequence \
    backup_pre_dump_current_count \
    backup_pre_dump_history_count

log "Creating PostgreSQL backup ${backup_name}"
pg_dump \
    --no-password \
    --format=custom \
    --compress=zstd:6 \
    --file="${backup_partial}" \
    "${DATABASE_NAME}"
require_file "${backup_partial}"
mv --force "${backup_partial}" "${backup_path}"
backup_partial=''
chmod 0600 "${backup_path}"

backup_sha256="$(sha256sum "${backup_path}" | awk '{print $1}')"
local_archive_size="$(stat --format=%s "${backup_path}")"
[[ "${backup_sha256}" =~ ^[0-9a-f]{64}$ ]] || die 'Backup SHA-256 is invalid'
[[ "${local_archive_size}" =~ ^[1-9][0-9]*$ ]] || die 'Backup archive size is invalid'
printf '%s  %s\n' "${backup_sha256}" "${backup_name}" > "${checksum_path}"
chmod 0600 "${checksum_path}"

jq --null-input \
    --arg created_at "${timestamp}" \
    --arg database "${DATABASE_NAME}" \
    --arg archive "${backup_name}" \
    --arg sha256 "${backup_sha256}" \
    --argjson size_bytes "${local_archive_size}" \
    --argjson current_sequence "${backup_current_sequence}" \
    --argjson history_sequence "${backup_history_sequence}" \
    --argjson pre_dump_current_count "${backup_pre_dump_current_count}" \
    --argjson pre_dump_history_count "${backup_pre_dump_history_count}" \
    '{
        created_at: $created_at,
        database: $database,
        archive: $archive,
        sha256: $sha256,
        size_bytes: $size_bytes,
        current_replication_sequence: $current_sequence,
        history_replication_sequence: $history_sequence,
        pre_dump_current_alpr_node_count: $pre_dump_current_count,
        pre_dump_history_event_count: $pre_dump_history_count
    }' > "${manifest_path}"
chmod 0600 "${manifest_path}"

aws s3 cp \
    --region "${AWS_REGION}" \
    "${backup_path}" \
    "s3://${BACKUP_BUCKET}/${archive_key}" \
    --metadata "sha256=${backup_sha256}" \
    --only-show-errors
aws s3 cp \
    --region "${AWS_REGION}" \
    "${checksum_path}" \
    "s3://${BACKUP_BUCKET}/${checksum_key}" \
    --only-show-errors
aws s3 cp \
    --region "${AWS_REGION}" \
    "${manifest_path}" \
    "s3://${BACKUP_BUCKET}/${manifest_key}" \
    --only-show-errors

archive_head="$(aws s3api head-object \
    --region "${AWS_REGION}" \
    --bucket "${BACKUP_BUCKET}" \
    --key "${archive_key}")"
remote_sha256="$(jq --raw-output '.Metadata.sha256 // empty' <<< "${archive_head}")"
remote_archive_size="$(jq --raw-output '.ContentLength // 0' <<< "${archive_head}")"
[[ "${remote_sha256}" == "${backup_sha256}" ]] \
    || die 'Remote backup SHA-256 metadata does not match the local archive'
[[ "${remote_archive_size}" == "${local_archive_size}" ]] \
    || die 'Remote backup content length does not match the local archive'

for sidecar_key in "${checksum_key}" "${manifest_key}"; do
    sidecar_size="$(aws s3api head-object \
        --region "${AWS_REGION}" \
        --bucket "${BACKUP_BUCKET}" \
        --key "${sidecar_key}" \
        --query ContentLength \
        --output text)"
    [[ "${sidecar_size}" =~ ^[1-9][0-9]*$ ]] \
        || die "Remote backup sidecar is missing or empty: ${sidecar_key}"
done

cleanup_local_backup

backup_completed_at="$(date --utc +%s)"
readonly backup_completed_at
write_pipeline_state last_successful_backup_unix_time "${backup_completed_at}"
write_pipeline_state last_successful_backup_s3_prefix "${object_prefix}"
put_metric BackupAgeSeconds 0 Seconds

log "Uploaded and remotely verified backup at s3://${BACKUP_BUCKET}/${object_prefix}/; local files removed"
