#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly HISTORY_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-history-bootstrap.complete"
readonly VALIDATION_MARKER="${OSM_STATE_PATH}/global-validation.complete"
readonly BACKUP_MARKER="${OSM_STATE_PATH}/backup.complete"
readonly CLEANUP_MARKER="${OSM_STATE_PATH}/global-history-bootstrap-source-removed.complete"
readonly PENDING_MARKER="${OSM_STATE_PATH}/global-history-bootstrap-source-removal.pending"
readonly PLANET_PATH="${OSM_DOWNLOAD_PATH}/global-history-bootstrap.osm.pbf"
readonly CHECKSUM_PATH="${OSM_DOWNLOAD_PATH}/global-history-bootstrap.osm.pbf.md5"

exec 8> /run/daf-osm/global.lock
flock --exclusive 8
exec 7> /run/daf-osm/global-current.lock
flock --exclusive 7
exec 6> /run/daf-osm/global-history.lock
flock --exclusive 6

if [[ -f "${CLEANUP_MARKER}" ]]; then
    require_file "${CLEANUP_MARKER}"
    [[ ! -e "${PLANET_PATH}" && ! -e "${PLANET_PATH}.partial" ]] \
        || die 'History cleanup marker exists while the full-history source remains'
    [[ ! -e "${CHECKSUM_PATH}" && ! -e "${CHECKSUM_PATH}.partial" ]] \
        || die 'History cleanup marker exists while the full-history checksum remains'
    rm --force -- "${PENDING_MARKER}" "${PENDING_MARKER}.partial"
    log 'History bootstrap source cleanup is already complete'
    exit 0
fi

require_file "${HISTORY_BOOTSTRAP_MARKER}"
require_file "${VALIDATION_MARKER}"
require_file "${BACKUP_MARKER}"
require_file "${OSM_STATE_PATH}/global-replication.state"
require_file "${OSM_STATE_PATH}/global-current-replication.state"
require_file "${OSM_STATE_PATH}/global-history-replication.state"

bootstrap_sequence="$(state_value "${HISTORY_BOOTSTRAP_MARKER}" sequence)"
validation_shared_sequence="$(state_value "${VALIDATION_MARKER}" shared_sequence)"
validation_current_sequence="$(state_value "${VALIDATION_MARKER}" current_sequence)"
validation_sequence="$(state_value "${VALIDATION_MARKER}" history_sequence)"
backup_shared_sequence="$(state_value "${BACKUP_MARKER}" shared_sequence)"
backup_current_sequence="$(state_value "${BACKUP_MARKER}" current_sequence)"
backup_sequence="$(state_value "${BACKUP_MARKER}" history_sequence)"
database_shared_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'shared_feed_sequence'")"
database_current_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'")"
database_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'")"
file_shared_sequence="$(state_sequence "${OSM_STATE_PATH}/global-replication.state")"
file_current_sequence="$(state_sequence "${OSM_STATE_PATH}/global-current-replication.state")"
file_sequence="$(state_sequence "${OSM_STATE_PATH}/global-history-replication.state")"

for sequence in \
    "${bootstrap_sequence}" \
    "${validation_shared_sequence}" \
    "${validation_current_sequence}" \
    "${validation_sequence}" \
    "${backup_shared_sequence}" \
    "${backup_current_sequence}" \
    "${backup_sequence}" \
    "${database_shared_sequence}" \
    "${database_current_sequence}" \
    "${database_sequence}" \
    "${file_shared_sequence}" \
    "${file_current_sequence}" \
    "${file_sequence}"; do
    [[ "${sequence}" =~ ^[0-9]+$ ]] || die "Cleanup gate found an invalid history sequence: ${sequence}"
done

(( validation_sequence >= bootstrap_sequence )) \
    || die 'Validation marker predates the history bootstrap cursor'
(( backup_sequence >= bootstrap_sequence )) \
    || die 'Verified backup marker predates the history bootstrap cursor'
[[ "${validation_shared_sequence}" == "${validation_current_sequence}" \
    && "${validation_shared_sequence}" == "${validation_sequence}" ]] \
    || die 'Validated global cursors differ at cleanup gate'
[[ "${backup_shared_sequence}" == "${backup_current_sequence}" \
    && "${backup_shared_sequence}" == "${backup_sequence}" ]] \
    || die 'Backed-up global cursors differ at cleanup gate'
[[ "${database_shared_sequence}" == "${database_current_sequence}" \
    && "${database_shared_sequence}" == "${database_sequence}" \
    && "${database_shared_sequence}" == "${file_shared_sequence}" \
    && "${database_shared_sequence}" == "${file_current_sequence}" \
    && "${database_shared_sequence}" == "${file_sequence}" ]] \
    || die 'Global database/file cursors differ at cleanup gate'

stored_validation_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'last_successful_validation_history_sequence'")"
stored_validation_shared_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'last_successful_validation_shared_sequence'")"
stored_backup_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'last_successful_backup_history_sequence'")"
stored_backup_shared_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'last_successful_backup_shared_sequence'")"
[[ "${stored_validation_sequence}" == "${validation_sequence}" ]] \
    || die 'Validation file/database markers differ'
[[ "${stored_validation_shared_sequence}" == "${validation_shared_sequence}" ]] \
    || die 'Shared validation file/database markers differ'
[[ "${stored_backup_sequence}" == "${backup_sequence}" ]] \
    || die 'Backup file/database markers differ'
[[ "${stored_backup_shared_sequence}" == "${backup_shared_sequence}" ]] \
    || die 'Shared backup file/database markers differ'

if [[ -f "${PENDING_MARKER}" ]]; then
    require_file "${PENDING_MARKER}"
    cleanup_sequence="$(state_value "${PENDING_MARKER}" history_sequence)"
    [[ "${cleanup_sequence}" =~ ^[0-9]+$ ]] \
        || die 'Pending cleanup marker has an invalid history sequence'
    (( cleanup_sequence >= bootstrap_sequence && cleanup_sequence <= database_sequence )) \
        || die 'Pending cleanup marker is outside the durable history cursor range'
else
    require_file "${PLANET_PATH}"
    require_file "${CHECKSUM_PATH}"
    cleanup_sequence="${database_sequence}"
    pending_partial="${PENDING_MARKER}.partial"
    printf 'history_sequence=%s\nstarted_at_unix=%s\n' \
        "${cleanup_sequence}" \
        "$(date --utc +%s)" \
        > "${pending_partial}"
    chmod 0640 "${pending_partial}"
    mv --force "${pending_partial}" "${PENDING_MARKER}"
fi

rm --force -- \
    "${PLANET_PATH}" \
    "${PLANET_PATH}.partial" \
    "${CHECKSUM_PATH}" \
    "${CHECKSUM_PATH}.partial"
[[ ! -e "${PLANET_PATH}" && ! -e "${PLANET_PATH}.partial" ]] \
    || die 'Full-history source removal failed'
[[ ! -e "${CHECKSUM_PATH}" && ! -e "${CHECKSUM_PATH}.partial" ]] \
    || die 'Full-history checksum removal failed'

removed_at="$(date --utc +%s)"
write_pipeline_state history_bootstrap_source_removed 1
write_pipeline_state history_bootstrap_source_removed_unix_time "${removed_at}"

marker_partial="${CLEANUP_MARKER}.partial"
printf 'history_sequence=%s\ncompleted_at_unix=%s\n' \
    "${cleanup_sequence}" \
    "${removed_at}" \
    > "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${CLEANUP_MARKER}"
rm --force -- "${PENDING_MARKER}"

log 'Removed the checksum-pinned full-history source after durable validation and remotely verified backup gates'
