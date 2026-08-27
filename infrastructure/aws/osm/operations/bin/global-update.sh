#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly GLOBAL_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-stack.complete"
readonly GLOBAL_STATE="${OSM_STATE_PATH}/global-replication.state"
readonly GLOBAL_SPOOL_PATH="${OSM_DATA_PATH}/global-replication-spool"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric SharedFeedFailures 1 Count || true
    exit "${exit_code}"
}

trap on_error ERR

record_shared_feed_state()
{
    local sequence="$1"
    local timestamp="$2"

    psql_osm \
        --set=shared_sequence="${sequence}" \
        --set=shared_timestamp="${timestamp}" <<'SHARED_FEED_STATE_SQL'
BEGIN;
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('shared_feed_sequence', :'shared_sequence'),
    ('shared_feed_source_timestamp', :'shared_timestamp')
ON CONFLICT (state_key) DO UPDATE
SET state_value = EXCLUDED.state_value, updated_at = clock_timestamp();
COMMIT;
SHARED_FEED_STATE_SQL
}

if [[ ! -f "${GLOBAL_BOOTSTRAP_MARKER}" ]]; then
    log 'Global stack bootstrap is not complete; skipping shared-feed update'
    exit 0
fi
require_file "${GLOBAL_STATE}"

install --directory --mode=0750 "${GLOBAL_SPOOL_PATH}"
find "${GLOBAL_SPOOL_PATH}" \
    -xdev \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    -name 'sequence-[0-9]*.partial' \
    -exec rm --recursive --force -- {} +
clean_stale_work_directories global-update
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/global-update.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

mapfile -t pending_batches < <(
    find "${GLOBAL_SPOOL_PATH}" \
        -xdev \
        -mindepth 1 \
        -maxdepth 1 \
        -type d \
        -name 'sequence-[0-9]*' \
        -print \
        | sort
)
(( ${#pending_batches[@]} <= 1 )) \
    || die 'Shared global replication spool contains more than one pending batch'

if (( ${#pending_batches[@]} == 0 )); then
    pending_state="${work_directory}/global-replication.pending.state"
    node_changes="${work_directory}/global-node-changes.osh.pbf"
    download_status=0
    node_version_count="$(/opt/daf-osm/venv/bin/python \
        /opt/daf-osm/bin/fetch-node-changes.py update \
        --server "${OSM_GLOBAL_REPLICATION_URL}" \
        --state "${GLOBAL_STATE}" \
        --pending-state "${pending_state}" \
        --output "${node_changes}" \
        --max-size-mb "${GLOBAL_MAX_CHANGE_SIZE_MB}")" \
        || download_status=$?

    if [[ "${download_status}" -eq 3 ]]; then
        log 'No global replication changes are available'
        exit 0
    fi
    [[ "${download_status}" -eq 0 ]] \
        || die "Global replication download failed with status ${download_status}"
    [[ "${node_version_count}" =~ ^[0-9]+$ ]] \
        || die 'Shared global replication downloader returned an invalid count'
    require_file "${node_changes}"
    require_file "${pending_state}"

    replication_sequence="$(state_sequence "${pending_state}")"
    previous_sequence="$(state_sequence "${GLOBAL_STATE}")"
    [[ "${replication_sequence}" =~ ^[0-9]+$ && "${previous_sequence}" =~ ^[0-9]+$ ]] \
        || die 'Shared global replication state has an invalid sequence'
    (( replication_sequence > previous_sequence )) \
        || die 'Shared global replication batch did not advance its cursor'

    partial_batch="${GLOBAL_SPOOL_PATH}/sequence-${replication_sequence}.partial"
    batch_directory="${GLOBAL_SPOOL_PATH}/sequence-${replication_sequence}"
    [[ ! -e "${partial_batch}" && ! -e "${batch_directory}" ]] \
        || die "Shared global replication batch already exists: ${replication_sequence}"
    install --directory --mode=0750 "${partial_batch}"
    install --mode=0640 "${node_changes}" "${partial_batch}/nodes.osh.pbf"
    install --mode=0640 "${pending_state}" "${partial_batch}/state.txt"
    printf 'first_sequence=%s\nlast_sequence=%s\nnode_version_count=%s\n' \
        "$((previous_sequence + 1))" \
        "${replication_sequence}" \
        "${node_version_count}" \
        > "${partial_batch}/manifest"
    chmod 0640 "${partial_batch}/manifest"
    mv "${partial_batch}" "${batch_directory}"
    promote_state "${pending_state}" "${GLOBAL_STATE}"
    record_shared_feed_state \
        "${replication_sequence}" \
        "$(state_timestamp "${pending_state}")"
else
    batch_directory="${pending_batches[0]}"
    replication_sequence="${batch_directory##*/sequence-}"
    [[ "${replication_sequence}" =~ ^[0-9]+$ ]] \
        || die 'Pending shared global replication batch has an invalid name'
    require_file "${batch_directory}/nodes.osh.pbf"
    require_file "${batch_directory}/state.txt"
    require_file "${batch_directory}/manifest"
    manifest_sequence="$(state_value "${batch_directory}/manifest" last_sequence)"
    [[ "${manifest_sequence}" == "${replication_sequence}" ]] \
        || die 'Pending shared batch manifest and directory sequences differ'
    [[ "$(state_sequence "${batch_directory}/state.txt")" == "${replication_sequence}" ]] \
        || die 'Pending shared batch state and directory sequences differ'

    feed_sequence="$(state_sequence "${GLOBAL_STATE}")"
    if (( feed_sequence < replication_sequence )); then
        promote_state "${batch_directory}/state.txt" "${GLOBAL_STATE}"
    elif (( feed_sequence > replication_sequence )); then
        die 'Shared feed cursor advanced beyond its only retained batch'
    fi
    record_shared_feed_state \
        "${replication_sequence}" \
        "$(state_timestamp "${batch_directory}/state.txt")"
fi

current_status=0
history_status=0
/usr/bin/flock --nonblock /run/daf-osm/global-current.lock \
    /opt/daf-osm/bin/current-update.sh \
    "${batch_directory}/nodes.osh.pbf" \
    "${batch_directory}/state.txt" \
    || current_status=$?
/usr/bin/flock --nonblock /run/daf-osm/global-history.lock \
    /opt/daf-osm/bin/history-update.sh \
    "${batch_directory}/nodes.osh.pbf" \
    "${batch_directory}/state.txt" \
    || history_status=$?

IFS=$'\t' read -r current_sequence history_sequence <<< "$(
    psql_osm --tuples-only --no-align --field-separator=$'\t' --command="
SELECT
    COALESCE((SELECT state_value::bigint FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'), 0),
    COALESCE((SELECT state_value::bigint FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'), 0)
"
)"
[[ "${current_sequence}" =~ ^[0-9]+$ && "${history_sequence}" =~ ^[0-9]+$ ]] \
    || die 'Shared global replication consumers returned invalid cursors'

if (( current_sequence >= replication_sequence && history_sequence >= replication_sequence )); then
    [[ "${batch_directory}" == "${GLOBAL_SPOOL_PATH}/sequence-${replication_sequence}" ]] \
        || die 'Refusing to remove an unexpected shared spool path'
    rm --recursive --force -- "${batch_directory}"
    put_metric SharedFeedRetainedBatchCount 0 Count
    log "Both consumers committed global replication sequence ${replication_sequence}; removed its spool batch"
else
    put_metric SharedFeedRetainedBatchCount 1 Count
fi

put_metric SharedFeedSequence "${replication_sequence}" Count
(( current_status == 0 )) || put_metric CurrentConsumerFailures 1 Count || true
(( history_status == 0 )) || put_metric HistoryConsumerFailures 1 Count || true
if (( current_status != 0 || history_status != 0 )); then
    trap - ERR
    log "ERROR: Global replication consumers failed: current=${current_status}, history=${history_status}" >&2
    exit 1
fi
