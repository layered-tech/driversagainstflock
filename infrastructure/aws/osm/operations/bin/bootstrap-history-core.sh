#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly PREPARED_MARKER="${OSM_STATE_PATH}/global-rebuild.prepared"
readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-history-bootstrap.complete"
readonly HISTORY_STATE="${OSM_STATE_PATH}/global-history-replication.state"
readonly PLANET_PATH="${OSM_DOWNLOAD_PATH}/global-history-bootstrap.osm.pbf"
readonly PLANET_CHECKSUM_PATH="${OSM_DOWNLOAD_PATH}/global-history-bootstrap.osm.pbf.md5"
readonly HISTORY_METADATA_PATH="${OSM_STATE_PATH}/global-history-planet-http-headers.txt"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric HistoryConsumerFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

require_file "${PREPARED_MARKER}"
if [[ -f "${BOOTSTRAP_MARKER}" ]]; then
    log 'Global history bootstrap is already complete'
    exit 0
fi

clean_stale_work_directories history-bootstrap
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/history-bootstrap.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

current_planet_url="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_planet_resolved_url'")"
if [[ "${current_planet_url}" =~ /planet-([0-9]{6})[.]osm[.]pbf$ ]]; then
    planet_release="${BASH_REMATCH[1]}"
else
    die 'Global current bootstrap has no immutable planet release URL'
fi
planet_release_year="20${planet_release:0:2}"
history_planet_url="${OSM_HISTORY_PLANET_ARCHIVE_URL%/}/${planet_release_year}/history-${planet_release}.osm.pbf"

if [[ ! -e "${PLANET_PATH}" && ! -e "${PLANET_PATH}.partial" ]]; then
    download "${history_planet_url}.md5" "${PLANET_CHECKSUM_PATH}"
    record_http_metadata "${history_planet_url}" "${HISTORY_METADATA_PATH}"
else
    require_file "${PLANET_CHECKSUM_PATH}"
    require_file "${HISTORY_METADATA_PATH}"
fi

resolved_history_url="$(sed -n 's/^resolved_url=//p' "${HISTORY_METADATA_PATH}" | tail -n 1)"
if [[ ! "${resolved_history_url}" =~ ^https://planet\.openstreetmap\.org/pbf/full-history/history-[0-9]{6}\.osm\.pbf$ \
    && ! "${resolved_history_url}" =~ ^https://osm-planet-us-west-2\.s3\.dualstack\.us-west-2\.amazonaws\.com/planet-full-history/pbf/[0-9]{4}/history-[0-9]{6}\.osm\.pbf$ ]]; then
    die "Unexpected resolved full-history URL: ${resolved_history_url}"
fi
if [[ ! "${resolved_history_url}" =~ /history-([0-9]{6})[.]osm[.]pbf$ \
    || "${BASH_REMATCH[1]}" != "${planet_release}" ]]; then
    die 'Current and full-history planet releases differ'
fi

history_md5="$(awk 'NR == 1 { print $1 }' "${PLANET_CHECKSUM_PATH}")"
[[ "${history_md5}" =~ ^[0-9a-fA-F]{32}$ ]] || die 'Full-history MD5 file is invalid'
history_md5="${history_md5,,}"

if [[ ! -s "${PLANET_PATH}" ]]; then
    log 'Downloading the checksum-pinned full-history planet once for both local scans'
    download "${resolved_history_url}" "${PLANET_PATH}"
fi
printf '%s  %s\n' "${history_md5}" "${PLANET_PATH}" | md5sum --check --status - \
    || die 'Full-history planet checksum verification failed'

matching_versions="${work_directory}/global-alpr-matching-versions.osh.pbf"
all_candidate_versions="${work_directory}/global-alpr-all-versions.osh.pbf"
candidate_ids="${work_directory}/global-alpr-node-ids.txt"

log 'Scanning the local full-history planet for exact ALPR node versions'
osmium tags-filter \
    --omit-referenced \
    --output "${matching_versions}" \
    "${PLANET_PATH}" \
    'n/surveillance:type=ALPR'

matching_node_count="$(osmium fileinfo --extended --get=data.count.nodes "${matching_versions}")"
matching_way_count="$(osmium fileinfo --extended --get=data.count.ways "${matching_versions}")"
matching_relation_count="$(osmium fileinfo --extended --get=data.count.relations "${matching_versions}")"
[[ "${matching_node_count}" =~ ^[1-9][0-9]*$ ]] || die 'Full history contains no exact ALPR node versions'
[[ "${matching_way_count}" == 0 && "${matching_relation_count}" == 0 ]] \
    || die 'ALPR candidate file unexpectedly contains non-node objects'

/opt/daf-osm/bin/import-history.py \
    --input "${matching_versions}" \
    --source full_history
psql_osm --file=/opt/daf-osm/database/discover-history-candidates.sql
psql_osm --tuples-only --no-align \
    --command='SELECT node_id FROM osm_pipeline.global_alpr_node_ids ORDER BY node_id' \
    > "${candidate_ids}"
require_file "${candidate_ids}"

log 'Reading every lifecycle version for all globally qualified node IDs'
osmium getid \
    --with-history \
    --id-file "${candidate_ids}" \
    --output "${all_candidate_versions}" \
    "${PLANET_PATH}"

candidate_node_count="$(osmium fileinfo --extended --get=data.count.nodes "${all_candidate_versions}")"
candidate_way_count="$(osmium fileinfo --extended --get=data.count.ways "${all_candidate_versions}")"
candidate_relation_count="$(osmium fileinfo --extended --get=data.count.relations "${all_candidate_versions}")"
[[ "${candidate_node_count}" =~ ^[1-9][0-9]*$ ]] || die 'Qualified nodes have no lifecycle versions'
[[ "${candidate_way_count}" == 0 && "${candidate_relation_count}" == 0 ]] \
    || die 'Qualified lifecycle history unexpectedly contains non-node objects'

/opt/daf-osm/bin/import-history.py \
    --input "${all_candidate_versions}" \
    --source full_history
psql_osm --file=/opt/daf-osm/database/history-bootstrap-load.sql

source_timestamp="$(osmium fileinfo \
    --get=header.option.osmosis_replication_timestamp \
    "${PLANET_PATH}")"
[[ -n "${source_timestamp}" ]] || die 'Full-history source has no replication timestamp'

pending_state="${work_directory}/history-replication.pending.state"
/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/fetch-node-changes.py initialize \
    --server "${OSM_GLOBAL_REPLICATION_URL}" \
    --start-timestamp "${source_timestamp}" \
    --pending-state "${pending_state}"
require_file "${pending_state}"
history_sequence="$(state_sequence "${pending_state}")"
history_cursor_timestamp="$(state_timestamp "${pending_state}")"
[[ "${history_sequence}" =~ ^[0-9]+$ ]] || die 'History replication state has no sequence'
[[ -n "${history_cursor_timestamp}" ]] || die 'History replication state has no timestamp'

write_pipeline_state history_applied_sequence "${history_sequence}"
write_pipeline_state history_source_timestamp "${history_cursor_timestamp}"
write_pipeline_state history_planet_md5 "${history_md5}"
write_pipeline_state history_planet_resolved_url "${resolved_history_url}"
promote_state "${pending_state}" "${HISTORY_STATE}"

write_pipeline_state history_bootstrap_complete 1

tracked_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_history.tracked_nodes')"
history_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_history.alpr_node_versions')"
put_metric HistoryBootstrapComplete 1 None
put_metric HistoryEventCount "${history_count}" Count
log "Global history bootstrap database and cursor complete: ${tracked_count} nodes, ${history_count} versions; checksum-pinned source retained for gated validation and backup"
