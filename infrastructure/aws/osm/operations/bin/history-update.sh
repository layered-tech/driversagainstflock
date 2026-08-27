#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-history-bootstrap.complete"
readonly HISTORY_STATE="${OSM_STATE_PATH}/global-history-replication.state"

if (( $# != 2 )); then
    die 'History consumer requires a shared global change and state file'
fi

if [[ ! -f "${BOOTSTRAP_MARKER}" ]]; then
    log 'History bootstrap is not complete; skipping update'
    exit 0
fi
require_file "${HISTORY_STATE}"

clean_stale_work_directories history-update
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/history-update.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

pending_state="${work_directory}/history-replication.pending.state"
node_changes="${work_directory}/history-node-changes.osh.pbf"

require_file "$1"
require_file "$2"
install --mode=0640 "$1" "${node_changes}"
install --mode=0640 "$2" "${pending_state}"
node_version_count="$(osmium fileinfo --extended --get=data.count.nodes "${node_changes}")"
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

candidate_list="${work_directory}/global-candidates.tsv"
psql_osm --tuples-only --no-align --field-separator=$'\t' \
    --set=max_candidates="${HISTORY_API_MAX_NODES_PER_RUN}" \
    > "${candidate_list}" <<'GLOBAL_HISTORY_CANDIDATES_SQL'
SELECT candidates.node_id, candidates.last_seen_version
FROM osm_pipeline.global_alpr_node_ids AS candidates
LEFT JOIN osm_history.tracked_nodes AS tracked ON tracked.node_id = candidates.node_id
WHERE tracked.node_id IS NULL
ORDER BY candidates.node_id
LIMIT :'max_candidates'::integer;
GLOBAL_HISTORY_CANDIDATES_SQL

processed_candidates=0
while IFS=$'\t' read -r node_id last_seen_version; do
    [[ "${node_id}" =~ ^[0-9]+$ && "${last_seen_version}" =~ ^[0-9]+$ ]] \
        || die 'Candidate query returned invalid node metadata'

    api_history="${work_directory}/node-${node_id}.osh"
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

    /opt/daf-osm/bin/import-history.py \
        --input "${api_history}" \
        --source api_backfill \
        --sequence "${replication_sequence}"
    psql_osm --file=/opt/daf-osm/database/history-bootstrap-load.sql

    processed_candidates=$((processed_candidates + 1))
    sleep "${HISTORY_API_DELAY_SECONDS}"
done < "${candidate_list}"

remaining_candidates="$(psql_osm --tuples-only --no-align <<'GLOBAL_HISTORY_REMAINING_SQL'
SELECT count(*)
FROM osm_pipeline.global_alpr_node_ids AS candidates
LEFT JOIN osm_history.tracked_nodes AS tracked ON tracked.node_id = candidates.node_id
WHERE tracked.node_id IS NULL;
GLOBAL_HISTORY_REMAINING_SQL
)"
[[ "${remaining_candidates}" =~ ^[0-9]+$ ]] || die 'Remaining candidate count is invalid'
if (( remaining_candidates > 0 )); then
    log "Holding history cursor while ${remaining_candidates} globally qualified nodes await API lifecycle backfills"
    exit 0
fi

write_pipeline_state history_applied_sequence "${replication_sequence}"
write_pipeline_state history_source_timestamp "${source_timestamp}"
promote_state "${pending_state}" "${HISTORY_STATE}"

history_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_history.alpr_node_versions')"
put_metric HistoryEventCount "${history_count}" Count
log "Applied global history sequence ${replication_sequence}: ${node_version_count} node versions, ${processed_candidates} API checks"
