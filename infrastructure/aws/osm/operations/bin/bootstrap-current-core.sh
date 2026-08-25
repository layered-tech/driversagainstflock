#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/current-bootstrap.complete"
readonly CURRENT_STATE="${OSM_STATE_PATH}/current-replication.state"
readonly EXTRACT_PATH="${OSM_DOWNLOAD_PATH}/north-america-bootstrap.osm.pbf"
readonly CHECKSUM_PATH="${OSM_DOWNLOAD_PATH}/north-america-bootstrap.osm.pbf.md5"
readonly EXTRACT_STATE_PATH="${OSM_DOWNLOAD_PATH}/north-america-bootstrap.state.txt"
readonly HTTP_METADATA_PATH="${OSM_STATE_PATH}/current-extract-http-headers.txt"

discard_current_snapshot()
{
    rm --force -- \
        "${EXTRACT_PATH}" \
        "${EXTRACT_PATH}.partial" \
        "${CHECKSUM_PATH}" \
        "${CHECKSUM_PATH}.partial" \
        "${EXTRACT_STATE_PATH}" \
        "${EXTRACT_STATE_PATH}.partial" \
        "${HTTP_METADATA_PATH}"
}

reject_inconsistent_current_snapshot()
{
    local reason="$1"

    discard_current_snapshot
    die "${reason}"
}

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric ReplicationUpdateFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

if [[ -f "${BOOTSTRAP_MARKER}" ]]; then
    log 'Current-state bootstrap is already complete'
    exit 0
fi

clean_stale_work_directories current-bootstrap
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/current-bootstrap.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

if [[ ! -e "${EXTRACT_PATH}" && ! -e "${EXTRACT_PATH}.partial" ]]; then
    download "${OSM_CURRENT_EXTRACT_CHECKSUM_URL}" "${CHECKSUM_PATH}"
    download "${OSM_CURRENT_EXTRACT_STATE_URL}" "${EXTRACT_STATE_PATH}"
    record_http_metadata "${OSM_CURRENT_EXTRACT_URL}" "${HTTP_METADATA_PATH}"
else
    require_file "${CHECKSUM_PATH}"
    require_file "${EXTRACT_STATE_PATH}"
    require_file "${HTTP_METADATA_PATH}"
fi

resolved_extract_url="$(sed -n 's/^resolved_url=//p' "${HTTP_METADATA_PATH}" | tail -n 1)"
[[ "${resolved_extract_url}" == https://download.openstreetmap.fr/extracts/north-america-latest.osm.pbf ]] \
    || die "Unexpected resolved current extract URL: ${resolved_extract_url}"

if [[ ! -s "${EXTRACT_PATH}" ]]; then
    download "${resolved_extract_url}" "${EXTRACT_PATH}"
fi

expected_md5="$(awk 'NR == 1 { print $1 }' "${CHECKSUM_PATH}")"
[[ "${expected_md5}" =~ ^[0-9a-fA-F]{32}$ ]] || die 'Current extract MD5 file is invalid'
printf '%s  %s\n' "${expected_md5}" "${EXTRACT_PATH}" | md5sum --check --status - \
    || die 'Current extract checksum verification failed'

replication_sequence="$(state_sequence "${EXTRACT_STATE_PATH}")"
source_timestamp="$(state_timestamp "${EXTRACT_STATE_PATH}")"
[[ "${replication_sequence}" =~ ^[0-9]+$ ]] \
    || reject_inconsistent_current_snapshot 'Current extract state has no sequence'
[[ -n "${source_timestamp}" ]] \
    || reject_inconsistent_current_snapshot 'Current extract state has no timestamp'

header_timestamp="$(osmium fileinfo \
    --get=header.option.osmosis_replication_timestamp \
    "${EXTRACT_PATH}")"
[[ "${header_timestamp}" == "${source_timestamp}" ]] \
    || reject_inconsistent_current_snapshot \
        "Extract/state timestamp mismatch: ${header_timestamp} != ${source_timestamp}"

filtered_path="${work_directory}/north-america-alpr.osm.pbf"
osmium tags-filter \
    --omit-referenced \
    --output="${filtered_path}" \
    "${EXTRACT_PATH}" \
    'n/surveillance:type=ALPR'

node_count="$(osmium fileinfo --extended --get=data.count.nodes "${filtered_path}")"
way_count="$(osmium fileinfo --extended --get=data.count.ways "${filtered_path}")"
relation_count="$(osmium fileinfo --extended --get=data.count.relations "${filtered_path}")"
[[ "${node_count}" =~ ^[1-9][0-9]*$ ]] || die 'Filtered current extract contains no ALPR nodes'
[[ "${way_count}" == 0 && "${relation_count}" == 0 ]] \
    || die 'Filtered current extract unexpectedly contains non-node objects'

log "Importing ${node_count} current ALPR nodes at sequence ${replication_sequence}"
osm2pgsql \
    --create \
    --slim \
    --extra-attributes \
    --output=flex \
    --style=/opt/daf-osm/database/alpr-current.lua \
    --database="${DATABASE_NAME}" \
    --host="${POSTGRESQL_SOCKET_DIR}" \
    --port="${POSTGRESQL_PORT}" \
    --username=osm_ingest \
    --prefix="${OSM2PGSQL_PREFIX}" \
    --middle-schema=osm_ingest \
    --cache="${OSM2PGSQL_CACHE_MB}" \
    --number-processes="${OSM2PGSQL_PROCESSES}" \
    "${filtered_path}"

psql_osm \
    --set=replication_sequence="${replication_sequence}" \
    --set=source_timestamp="${source_timestamp}" \
    --file=/opt/daf-osm/database/publish-current.sql

write_pipeline_state current_extract_md5 "${expected_md5,,}"
promote_state "${EXTRACT_STATE_PATH}" "${CURRENT_STATE}"
install --mode=0640 /dev/null "${BOOTSTRAP_MARKER}"

rm --force -- "${EXTRACT_PATH}" "${EXTRACT_PATH}.partial" "${CHECKSUM_PATH}" "${CHECKSUM_PATH}.partial" "${EXTRACT_STATE_PATH}.partial"

put_metric CurrentAlprNodeCount "${node_count}" Count
put_metric ReplicationSequence "${replication_sequence}" Count
log 'Current-state bootstrap complete; source extract removed after durable publish and cursor promotion'
