#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly PREPARED_MARKER="${OSM_STATE_PATH}/global-rebuild.prepared"
readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-current-bootstrap.complete"
readonly CURRENT_STATE="${OSM_STATE_PATH}/global-current-replication.state"
readonly PLANET_PATH="${OSM_DOWNLOAD_PATH}/global-current-bootstrap.osm.pbf"
readonly CHECKSUM_PATH="${OSM_DOWNLOAD_PATH}/global-current-bootstrap.osm.pbf.md5"
readonly HTTP_METADATA_PATH="${OSM_STATE_PATH}/global-current-planet-http-headers.txt"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric CurrentConsumerFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

require_file "${PREPARED_MARKER}"
if [[ -f "${BOOTSTRAP_MARKER}" ]]; then
    log 'Global current-state bootstrap is already complete'
    exit 0
fi

clean_stale_work_directories global-current-bootstrap
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/global-current-bootstrap.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

if [[ ! -e "${PLANET_PATH}" && ! -e "${PLANET_PATH}.partial" ]]; then
    record_http_metadata "${OSM_GLOBAL_CURRENT_PLANET_URL}" "${HTTP_METADATA_PATH}"
else
    require_file "${HTTP_METADATA_PATH}"
fi

resolved_planet_url="$(sed -n 's/^resolved_url=//p' "${HTTP_METADATA_PATH}" | tail -n 1)"
if [[ ! "${resolved_planet_url}" =~ ^https://planet\.openstreetmap\.org/pbf/planet-[0-9]{6}\.osm\.pbf$ \
    && ! "${resolved_planet_url}" =~ ^https://osm-planet-us-west-2\.s3\.dualstack\.us-west-2\.amazonaws\.com/planet/pbf/[0-9]{4}/planet-[0-9]{6}\.osm\.pbf$ ]]; then
    die "Unexpected resolved current planet URL: ${resolved_planet_url}"
fi

if [[ ! -e "${PLANET_PATH}" && ! -e "${PLANET_PATH}.partial" ]]; then
    download "${resolved_planet_url}.md5" "${CHECKSUM_PATH}"
else
    require_file "${CHECKSUM_PATH}"
fi

expected_md5="$(awk 'NR == 1 { print $1 }' "${CHECKSUM_PATH}")"
[[ "${expected_md5}" =~ ^[0-9a-fA-F]{32}$ ]] || die 'Current planet MD5 file is invalid'
expected_md5="${expected_md5,,}"

if [[ ! -s "${PLANET_PATH}" ]]; then
    download "${resolved_planet_url}" "${PLANET_PATH}"
fi
printf '%s  %s\n' "${expected_md5}" "${PLANET_PATH}" | md5sum --check --status - \
    || die 'Current planet checksum verification failed'

source_timestamp="$(osmium fileinfo \
    --get=header.option.osmosis_replication_timestamp \
    "${PLANET_PATH}")"
[[ -n "${source_timestamp}" ]] || die 'Current planet source has no replication timestamp'

pending_state="${work_directory}/global-current-replication.pending.state"
/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/fetch-node-changes.py initialize \
    --server "${OSM_GLOBAL_REPLICATION_URL}" \
    --start-timestamp "${source_timestamp}" \
    --pending-state "${pending_state}"
require_file "${pending_state}"
replication_sequence="$(state_sequence "${pending_state}")"
cursor_timestamp="$(state_timestamp "${pending_state}")"
[[ "${replication_sequence}" =~ ^[0-9]+$ ]] || die 'Current planet cursor has no sequence'
[[ -n "${cursor_timestamp}" ]] || die 'Current planet cursor has no timestamp'

filtered_path="${work_directory}/global-current-alpr.osm.pbf"
osmium tags-filter \
    --omit-referenced \
    --output "${filtered_path}" \
    "${PLANET_PATH}" \
    'n/surveillance:type=ALPR'

node_count="$(osmium fileinfo --extended --get=data.count.nodes "${filtered_path}")"
way_count="$(osmium fileinfo --extended --get=data.count.ways "${filtered_path}")"
relation_count="$(osmium fileinfo --extended --get=data.count.relations "${filtered_path}")"
[[ "${node_count}" =~ ^[1-9][0-9]*$ ]] || die 'Filtered global current planet contains no ALPR nodes'
[[ "${way_count}" == 0 && "${relation_count}" == 0 ]] \
    || die 'Filtered global current planet unexpectedly contains non-node objects'

log "Importing ${node_count} global current ALPR nodes at sequence ${replication_sequence}"
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
    --schema=osm_ingest \
    --middle-schema=osm_ingest \
    --cache="${OSM2PGSQL_CACHE_MB}" \
    --number-processes="${OSM2PGSQL_PROCESSES}" \
    "${filtered_path}"

psql_osm \
    --set=replication_sequence="${replication_sequence}" \
    --set=source_timestamp="${cursor_timestamp}" \
    --file=/opt/daf-osm/database/publish-current.sql

write_pipeline_state current_planet_md5 "${expected_md5}"
write_pipeline_state current_planet_resolved_url "${resolved_planet_url}"
promote_state "${pending_state}" "${CURRENT_STATE}"

rm --force -- "${PLANET_PATH}" "${PLANET_PATH}.partial" "${CHECKSUM_PATH}" "${CHECKSUM_PATH}.partial"

put_metric CurrentAlprNodeCount "${node_count}" Count
put_metric CurrentConsumerSequence "${replication_sequence}" Count
log 'Global current-state bootstrap complete; checksum-pinned source removed after durable publish'
