#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/current-bootstrap.complete"
readonly CURRENT_STATE="${OSM_STATE_PATH}/current-replication.state"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric ReplicationUpdateFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

if [[ ! -f "${BOOTSTRAP_MARKER}" ]]; then
    log 'Current-state bootstrap is not complete; skipping update'
    exit 0
fi
require_file "${CURRENT_STATE}"

clean_stale_work_directories current-update
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/current-update.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

pending_state="${work_directory}/current-replication.pending.state"
raw_change="${work_directory}/current-raw.osc.gz"
filtered_change="${work_directory}/current-alpr.osc.gz"
tracked_ids="${work_directory}/tracked-node-ids.txt"
download_status=0
node_version_count="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/fetch-node-changes.py update \
    --server "${OSM_CURRENT_REPLICATION_URL}" \
    --state "${CURRENT_STATE}" \
    --pending-state "${pending_state}" \
    --output "${raw_change}" \
    --simplify \
    --max-size-mb "${CURRENT_MAX_CHANGE_SIZE_MB}")" \
    || download_status=$?

if [[ "${download_status}" -eq 3 ]]; then
    log 'No current replication changes are available'
    exit 0
fi
[[ "${download_status}" -eq 0 ]] || die "Current replication download failed with status ${download_status}"
[[ "${node_version_count}" =~ ^[0-9]+$ ]] \
    || die 'Node-only current replication downloader returned an invalid count'
require_file "${raw_change}"
require_file "${pending_state}"

replication_sequence="$(state_sequence "${pending_state}")"
source_timestamp="$(state_timestamp "${pending_state}")"
[[ "${replication_sequence}" =~ ^[0-9]+$ ]] || die 'Pending current state has no sequence'
[[ -n "${source_timestamp}" ]] || die 'Pending current state has no timestamp'

applied_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'")"
if [[ "${applied_sequence}" =~ ^[0-9]+$ ]] \
    && (( applied_sequence >= replication_sequence )); then
    log "Sequence ${replication_sequence} was already committed; promoting its cursor"
    promote_state "${pending_state}" "${CURRENT_STATE}"
    exit 0
fi

psql_osm --tuples-only --no-align \
    --command='SELECT node_id FROM osm_ingest.alpr_nodes_stage ORDER BY node_id' \
    > "${tracked_ids}"

written_count="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/filter-current-change.py \
    --input "${raw_change}" \
    --output "${filtered_change}" \
    --tracked-ids "${tracked_ids}")"
[[ "${written_count}" =~ ^[0-9]+$ ]] || die 'Current change filter returned an invalid count'

if (( written_count > 0 )); then
    osm2pgsql \
        --append \
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
        "${filtered_change}"

    psql_osm \
        --set=replication_sequence="${replication_sequence}" \
        --set=source_timestamp="${source_timestamp}" \
        --file=/opt/daf-osm/database/publish-current.sql
else
    psql_osm \
        --set=replication_sequence="${replication_sequence}" \
        --set=source_timestamp="${source_timestamp}" <<'CURRENT_STATE_SQL'
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('current_applied_sequence', :'replication_sequence'),
    ('current_source_timestamp', :'source_timestamp'),
    ('last_successful_replication_unix_time', extract(epoch FROM clock_timestamp())::bigint::text)
ON CONFLICT (state_key) DO UPDATE
SET state_value = EXCLUDED.state_value, updated_at = clock_timestamp();
CURRENT_STATE_SQL
fi

promote_state "${pending_state}" "${CURRENT_STATE}"
current_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_current.alpr_nodes')"
put_metric CurrentAlprNodeCount "${current_count}" Count
put_metric ReplicationSequence "${replication_sequence}" Count
put_metric LastSuccessfulReplicationUnixTime "$(date --utc +%s)" Seconds
log "Applied current replication sequence ${replication_sequence} (${written_count} relevant versions)"
