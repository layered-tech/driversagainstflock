#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/history-bootstrap.complete"
readonly HISTORY_STATE="${OSM_STATE_PATH}/history-replication.state"
readonly POLYGON_PATH="${OSM_DOWNLOAD_PATH}/north-america.poly"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric ReplicationUpdateFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

if [[ ! -f "${BOOTSTRAP_MARKER}" ]]; then
    log 'History bootstrap is not complete; skipping update'
    exit 0
fi
require_file "${HISTORY_STATE}"
require_file "${POLYGON_PATH}"

clean_stale_work_directories history-update
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/history-update.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

pending_state="${work_directory}/history-replication.pending.state"
node_changes="${work_directory}/history-node-changes.osh.pbf"

download_status=0
node_version_count="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/fetch-node-changes.py update \
    --server "${OSM_HISTORY_REPLICATION_URL}" \
    --state "${HISTORY_STATE}" \
    --pending-state "${pending_state}" \
    --output "${node_changes}" \
    --max-size-mb "${HISTORY_MAX_CHANGE_SIZE_MB}")" \
    || download_status=$?

if [[ "${download_status}" -eq 3 ]]; then
    log 'No global replication changes are available'
    exit 0
fi
[[ "${download_status}" -eq 0 ]] \
    || die "Global replication download failed with status ${download_status}"
[[ "${node_version_count}" =~ ^[0-9]+$ ]] \
    || die 'Node-only replication downloader returned an invalid count'
require_file "${pending_state}"

replication_sequence="$(state_sequence "${pending_state}")"
source_timestamp="$(state_timestamp "${pending_state}")"
[[ "${replication_sequence}" =~ ^[0-9]+$ ]] || die 'Pending history state has no sequence'
[[ -n "${source_timestamp}" ]] || die 'Pending history state has no timestamp'

applied_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'")"
if [[ "${applied_sequence}" =~ ^[0-9]+$ ]] \
    && (( applied_sequence >= replication_sequence )); then
    log "History sequence ${replication_sequence} was already committed; promoting its cursor"
    promote_state "${pending_state}" "${HISTORY_STATE}"
    exit 0
fi

if (( node_version_count > 0 )); then
    node_way_count="$(osmium fileinfo --extended --get=data.count.ways "${node_changes}")"
    node_relation_count="$(osmium fileinfo --extended --get=data.count.relations "${node_changes}")"
    [[ "${node_way_count}" == 0 && "${node_relation_count}" == 0 ]] \
        || die 'Node-only history change unexpectedly contains non-node objects'

    /opt/daf-osm/bin/import-history.py \
        --input "${node_changes}" \
        --source minute_diff \
        --sequence "${replication_sequence}"
    psql_osm --file=/opt/daf-osm/database/history-load.sql
fi

candidate_list="${work_directory}/regional-candidates.tsv"
psql_osm --tuples-only --no-align --field-separator=$'\t' \
    --set=max_candidates="${HISTORY_API_MAX_NODES_PER_RUN}" \
    --command="SELECT candidates.node_id, candidates.last_seen_version FROM osm_pipeline.global_alpr_node_ids AS candidates LEFT JOIN osm_history.tracked_nodes AS tracked ON tracked.node_id = candidates.node_id WHERE tracked.node_id IS NULL AND (candidates.last_region_check_version IS NULL OR candidates.last_region_check_version < candidates.last_seen_version) ORDER BY candidates.node_id LIMIT :'max_candidates'::integer" \
    > "${candidate_list}"

processed_candidates=0
while IFS=$'\t' read -r node_id last_seen_version; do
    [[ "${node_id}" =~ ^[0-9]+$ && "${last_seen_version}" =~ ^[0-9]+$ ]] \
        || die 'Candidate query returned invalid node metadata'

    api_history="${work_directory}/node-${node_id}.osh"
    matching_history="${work_directory}/node-${node_id}-alpr.osh.pbf"
    regional_matching_history="${work_directory}/node-${node_id}-north-america-alpr.osh.pbf"

    log "Backfilling public lifecycle history for candidate node ${node_id}"
    curl --fail --silent --show-error --location --retry 5 --retry-all-errors \
        --user-agent "${OSM_HTTP_USER_AGENT}" \
        --output "${api_history}.partial" \
        "${OSM_API_URL}/node/${node_id}/history"
    mv --force "${api_history}.partial" "${api_history}"
    require_file "${api_history}"

    api_node_count="$(osmium fileinfo --extended --get=data.count.nodes "${api_history}")"
    api_way_count="$(osmium fileinfo --extended --get=data.count.ways "${api_history}")"
    api_relation_count="$(osmium fileinfo --extended --get=data.count.relations "${api_history}")"
    [[ "${api_node_count}" =~ ^[1-9][0-9]*$ ]] || die 'OSM API returned no node lifecycle versions'
    [[ "${api_way_count}" == 0 && "${api_relation_count}" == 0 ]] \
        || die 'OSM node history API unexpectedly returned non-node objects'

    osmium tags-filter \
        --omit-referenced \
        --output "${matching_history}" \
        "${api_history}" \
        'n/surveillance:type=ALPR'
    osmium extract \
        --with-history \
        --option=relations=false \
        --polygon "${POLYGON_PATH}" \
        --output "${regional_matching_history}" \
        "${matching_history}"

    regional_matching_count="$(osmium fileinfo --extended --get=data.count.nodes "${regional_matching_history}")"
    regional_matching_way_count="$(osmium fileinfo --extended --get=data.count.ways "${regional_matching_history}")"
    regional_matching_relation_count="$(osmium fileinfo --extended --get=data.count.relations "${regional_matching_history}")"
    [[ "${regional_matching_count}" =~ ^[0-9]+$ ]] \
        || die 'Regional exact-ALPR API history has an invalid node count'
    [[ "${regional_matching_way_count}" == 0 && "${regional_matching_relation_count}" == 0 ]] \
        || die 'Regional exact-ALPR API history unexpectedly contains non-node objects'

    if (( regional_matching_count > 0 )); then
        /opt/daf-osm/bin/import-history.py \
            --input "${api_history}" \
            --source api_backfill \
            --sequence "${replication_sequence}"
        psql_osm --file=/opt/daf-osm/database/history-bootstrap-load.sql
    else
        psql_osm \
            --set=node_id="${node_id}" \
            --set=last_seen_version="${last_seen_version}" \
            --command="UPDATE osm_pipeline.global_alpr_node_ids SET last_region_check_version = :'last_seen_version'::integer, last_region_checked_at = clock_timestamp(), updated_at = clock_timestamp() WHERE node_id = :'node_id'::bigint"
    fi

    processed_candidates=$((processed_candidates + 1))
    sleep "${HISTORY_API_DELAY_SECONDS}"
done < "${candidate_list}"

remaining_candidates="$(psql_osm --tuples-only --no-align \
    --command="SELECT count(*) FROM osm_pipeline.global_alpr_node_ids AS candidates LEFT JOIN osm_history.tracked_nodes AS tracked ON tracked.node_id = candidates.node_id WHERE tracked.node_id IS NULL AND (candidates.last_region_check_version IS NULL OR candidates.last_region_check_version < candidates.last_seen_version)")"
[[ "${remaining_candidates}" =~ ^[0-9]+$ ]] || die 'Remaining candidate count is invalid'
if (( remaining_candidates > 0 )); then
    log "Holding history cursor while ${remaining_candidates} candidate nodes await API region checks"
    exit 0
fi

write_pipeline_state history_applied_sequence "${replication_sequence}"
write_pipeline_state history_source_timestamp "${source_timestamp}"
promote_state "${pending_state}" "${HISTORY_STATE}"

history_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_history.alpr_node_versions')"
put_metric HistoryEventCount "${history_count}" Count
log "Applied global history sequence ${replication_sequence}: ${node_version_count} node versions, ${processed_candidates} API checks"
