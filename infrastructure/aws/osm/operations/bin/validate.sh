#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

exec 8> /run/daf-osm/global.lock
flock --exclusive 8
exec 7> /run/daf-osm/global-current.lock
flock --exclusive 7
exec 6> /run/daf-osm/global-history.lock
flock --exclusive 6

/opt/daf-osm/bin/validate-core.sh

current_metadata_errors="$(psql_osm --tuples-only --no-align --command="
SELECT count(*)
FROM osm_current.alpr_nodes
WHERE osm_version IS NULL
   OR osm_updated_at IS NULL
   OR changeset_id IS NULL
   OR osm_uid IS NULL
   OR osm_user IS NULL
")"
[[ "${current_metadata_errors}" == 0 ]] \
    || die "Current contributor/version metadata is missing from ${current_metadata_errors} rows"

history_stage_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_pipeline.node_versions_stage')"
[[ "${history_stage_count}" == 0 ]] \
    || die "History staging cleanup is incomplete: ${history_stage_count} retained rows"

for removed_current_source in \
    "${OSM_DOWNLOAD_PATH}/global-current-bootstrap.osm.pbf" \
    "${OSM_DOWNLOAD_PATH}/global-current-bootstrap.osm.pbf.md5"; do
    [[ ! -e "${removed_current_source}" && ! -e "${removed_current_source}.partial" ]] \
        || die "Current bootstrap source cleanup is incomplete: ${removed_current_source}"
done

history_cleanup_marker="${OSM_STATE_PATH}/global-history-bootstrap-source-removed.complete"
if [[ -f "${history_cleanup_marker}" ]]; then
    require_file "${history_cleanup_marker}"
    for removed_history_source in \
        "${OSM_DOWNLOAD_PATH}/global-history-bootstrap.osm.pbf" \
        "${OSM_DOWNLOAD_PATH}/global-history-bootstrap.osm.pbf.md5"; do
        [[ ! -e "${removed_history_source}" && ! -e "${removed_history_source}.partial" ]] \
            || die "History bootstrap source cleanup is incomplete: ${removed_history_source}"
    done
fi

flat_node_files="$(find "${OSM_DATA_PATH}" \
    -xdev \
    -type f \
    \( -iname '*flat*node*' -o -iname '*.nodes.bin' \) \
    -print \
    -quit)"
[[ -z "${flat_node_files}" ]] || die "Unexpected flat-node storage exists: ${flat_node_files}"

shared_sequence="$(state_sequence "${OSM_STATE_PATH}/global-replication.state")"
current_sequence="$(state_sequence "${OSM_STATE_PATH}/global-current-replication.state")"
history_sequence="$(state_sequence "${OSM_STATE_PATH}/global-history-replication.state")"
validated_at="$(date --utc +%s)"
[[ "${current_sequence}" =~ ^[0-9]+$ ]] || die 'Validated current sequence is invalid'
[[ "${history_sequence}" =~ ^[0-9]+$ ]] || die 'Validated history sequence is invalid'
[[ "${shared_sequence}" =~ ^[0-9]+$ ]] || die 'Validated shared feed sequence is invalid'
[[ "${shared_sequence}" == "${current_sequence}" && "${shared_sequence}" == "${history_sequence}" ]] \
    || die 'Validated global cursors have not converged'

write_pipeline_state last_successful_validation_shared_sequence "${shared_sequence}"
write_pipeline_state last_successful_validation_unix_time "${validated_at}"
write_pipeline_state last_successful_validation_current_sequence "${current_sequence}"
write_pipeline_state last_successful_validation_history_sequence "${history_sequence}"

marker_path="${OSM_STATE_PATH}/global-validation.complete"
marker_partial="${marker_path}.partial"
printf 'shared_sequence=%s\ncurrent_sequence=%s\nhistory_sequence=%s\ncompleted_at_unix=%s\n' \
    "${shared_sequence}" \
    "${current_sequence}" \
    "${history_sequence}" \
    "${validated_at}" \
    > "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${marker_path}"

log 'Storage, contributor metadata, history staging, and durable validation-marker contracts validated'
