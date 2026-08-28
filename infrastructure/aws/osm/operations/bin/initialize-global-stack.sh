#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly CURRENT_MARKER="${OSM_STATE_PATH}/global-current-bootstrap.complete"
readonly HISTORY_MARKER="${OSM_STATE_PATH}/global-history-bootstrap.complete"
readonly CURRENT_STATE="${OSM_STATE_PATH}/global-current-replication.state"
readonly HISTORY_STATE="${OSM_STATE_PATH}/global-history-replication.state"
readonly GLOBAL_STATE="${OSM_STATE_PATH}/global-replication.state"
readonly GLOBAL_MARKER="${OSM_STATE_PATH}/global-stack.complete"

if [[ -f "${GLOBAL_MARKER}" ]]; then
    require_file "${GLOBAL_MARKER}"
    log 'Global stack is already initialized'
    exit 0
fi

require_file "${CURRENT_MARKER}"
require_file "${HISTORY_MARKER}"
require_file "${CURRENT_STATE}"
require_file "${HISTORY_STATE}"

current_sequence="$(state_sequence "${CURRENT_STATE}")"
history_sequence="$(state_sequence "${HISTORY_STATE}")"
current_timestamp="$(state_timestamp "${CURRENT_STATE}")"
history_timestamp="$(state_timestamp "${HISTORY_STATE}")"
database_current_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'")"
database_history_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'")"

for sequence in \
    "${current_sequence}" \
    "${history_sequence}" \
    "${database_current_sequence}" \
    "${database_history_sequence}"; do
    [[ "${sequence}" =~ ^[0-9]+$ ]] || die "Global initialization found an invalid sequence: ${sequence}"
done
[[ "${current_sequence}" == "${database_current_sequence}" ]] \
    || die 'Global current bootstrap database/file cursors differ'
[[ "${history_sequence}" == "${database_history_sequence}" ]] \
    || die 'Global history bootstrap database/file cursors differ'
[[ "${current_sequence}" == "${history_sequence}" ]] \
    || die 'Global current and history bootstraps do not share one release cursor'
[[ -n "${current_timestamp}" && "${current_timestamp}" == "${history_timestamp}" ]] \
    || die 'Global current and history bootstraps do not share one release timestamp'

install --mode=0640 "${CURRENT_STATE}" "${GLOBAL_STATE}.pending"
feed_sequence="${current_sequence}"
mv --force "${GLOBAL_STATE}.pending" "${GLOBAL_STATE}"

feed_timestamp="$(state_timestamp "${GLOBAL_STATE}")"
[[ -n "${feed_timestamp}" ]] || die 'Initialized shared feed state has no timestamp'
psql_osm \
    --set=feed_sequence="${feed_sequence}" \
    --set=feed_timestamp="${feed_timestamp}" <<'INITIAL_SHARED_FEED_STATE_SQL'
BEGIN;
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('shared_feed_sequence', :'feed_sequence'),
    ('shared_feed_source_timestamp', :'feed_timestamp')
ON CONFLICT (state_key) DO UPDATE
SET state_value = EXCLUDED.state_value, updated_at = clock_timestamp();
COMMIT;
INITIAL_SHARED_FEED_STATE_SQL

marker_partial="${GLOBAL_MARKER}.partial"
printf 'feed_sequence=%s\ncurrent_sequence=%s\nhistory_sequence=%s\ninitialized_at=%s\n' \
    "${feed_sequence}" \
    "${current_sequence}" \
    "${history_sequence}" \
    "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" \
    > "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${GLOBAL_MARKER}"

log "Initialized shared global feed at sequence ${feed_sequence} for current/history ${current_sequence}/${history_sequence}"
