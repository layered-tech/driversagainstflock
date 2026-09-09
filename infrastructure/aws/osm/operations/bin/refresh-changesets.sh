#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common-core.sh
source /opt/daf-osm/bin/common-core.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-changeset-bootstrap.complete"
readonly ACTIVATION_MARKER="${OSM_STATE_PATH}/global-changeset.complete"
readonly CHANGESET_STATE="${OSM_STATE_PATH}/global-changeset-replication.state"
readonly RETAINED_DUMP_MARKER="${OSM_STATE_PATH}/global-changeset-retained-dump.path"
readonly REFRESH_RESULT="${OSM_STATE_PATH}/global-changeset-refresh.pending"
readonly REFRESH_HTTP_METADATA="${OSM_STATE_PATH}/global-changeset-refresh-http-headers.txt"

(( EUID == 0 )) || die 'Changeset dump refresh must run as root'
require_file "${BOOTSTRAP_MARKER}"
require_file "${ACTIVATION_MARKER}"
require_file "${CHANGESET_STATE}"
require_file "${RETAINED_DUMP_MARKER}"

update_was_enabled=0
backfill_was_enabled=0
systemctl is-enabled --quiet daf-osm-changeset-update.timer && update_was_enabled=1
systemctl is-enabled --quiet daf-osm-changeset-backfill.timer && backfill_was_enabled=1

restore_timers()
{
    if (( update_was_enabled == 1 )); then
        systemctl enable --now daf-osm-changeset-update.timer || true
    else
        systemctl disable --now daf-osm-changeset-update.timer || true
    fi
    if (( backfill_was_enabled == 1 )); then
        systemctl enable --now daf-osm-changeset-backfill.timer || true
    else
        systemctl disable --now daf-osm-changeset-backfill.timer || true
    fi
}
trap restore_timers EXIT

systemctl disable daf-osm-changeset-update.timer daf-osm-changeset-backfill.timer
systemctl stop \
    daf-osm-changeset-update.service \
    daf-osm-changeset-backfill.service \
    2>/dev/null || true

exec 10> /run/daf-osm/backup.lock
flock --nonblock 10 || die 'Backup or validation is active; refusing changeset refresh'
exec 9> /run/daf-osm/global-changeset.lock
flock --exclusive 9
exec 8> /run/daf-osm/global-changeset-backfill.lock
flock --exclusive 8

for required_state_key in \
    changeset_dump_md5 \
    changeset_dump_resolved_url \
    changeset_dump_timestamp \
    changeset_dump_max_id \
    changeset_dump_replay_sequence; do
    state_entry="$(psql_osm --tuples-only --no-align \
        --set=state_key="${required_state_key}" \
        <<'REQUIRED_REFRESH_STATE_SQL'
SELECT state_value FROM osm_pipeline.state WHERE state_key = :'state_key';
REQUIRED_REFRESH_STATE_SQL
)"
    [[ -n "${state_entry}" ]] || die "Missing retained changeset state: ${required_state_key}"
done

old_dump_path="$(< "${RETAINED_DUMP_MARKER}")"
require_file "${old_dump_path}"
require_file "${old_dump_path}.md5"
live_cursor_before="$(state_sequence "${CHANGESET_STATE}")"
database_cursor_before="$(psql_osm --tuples-only --no-align --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_applied_sequence'")"
[[ "${live_cursor_before}" == "${database_cursor_before}" ]] \
    || die 'Changeset database/file cursors differ before refresh'

runuser --preserve-environment --user osm_ingest -- \
    /opt/daf-osm/bin/bootstrap-changesets-core.sh --mode refresh
require_file "${REFRESH_RESULT}"

new_dump_path="$(state_value "${REFRESH_RESULT}" dump_path)"
new_checksum_path="$(state_value "${REFRESH_RESULT}" checksum_path)"
new_dump_url="$(state_value "${REFRESH_RESULT}" dump_url)"
new_dump_md5="$(state_value "${REFRESH_RESULT}" dump_md5)"
new_dump_timestamp="$(state_value "${REFRESH_RESULT}" dump_timestamp)"
new_dump_max_id="$(state_value "${REFRESH_RESULT}" dump_max_id)"
new_replay_sequence="$(state_value "${REFRESH_RESULT}" replay_sequence)"
require_file "${new_dump_path}"
require_file "${new_checksum_path}"
[[ "${new_dump_md5}" =~ ^[0-9a-f]{32}$ \
    && "${new_dump_max_id}" =~ ^[0-9]+$ \
    && "${new_replay_sequence}" =~ ^[0-9]+$ ]] \
    || die 'Refreshed discussion dump metadata is invalid'
printf '%s  %s\n' "${new_dump_md5}" "${new_dump_path}" | md5sum --check --status - \
    || die 'Refreshed discussion dump checksum no longer matches'

psql_osm \
    --set=dump_url="${new_dump_url}" \
    --set=dump_md5="${new_dump_md5}" \
    --set=dump_timestamp="${new_dump_timestamp}" \
    --set=dump_max_id="${new_dump_max_id}" \
    --set=replay_sequence="${new_replay_sequence}" <<'REFRESH_STATE_SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('daf-osm-changeset-load', 0));
DELETE FROM osm_pipeline.feed_changesets
WHERE observed_at <= :'dump_timestamp'::timestamptz;
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('changeset_dump_resolved_url', :'dump_url'),
    ('changeset_dump_md5', :'dump_md5'),
    ('changeset_dump_timestamp', :'dump_timestamp'),
    ('changeset_dump_max_id', :'dump_max_id'),
    ('changeset_dump_replay_sequence', :'replay_sequence')
ON CONFLICT (state_key) DO UPDATE SET
    state_value = EXCLUDED.state_value,
    updated_at = clock_timestamp();
COMMIT;
REFRESH_STATE_SQL

retained_marker_partial="${RETAINED_DUMP_MARKER}.partial"
printf '%s\n' "${new_dump_path}" > "${retained_marker_partial}"
chown osm_ingest:osm_ingest "${retained_marker_partial}"
chmod 0640 "${retained_marker_partial}"
mv --force "${retained_marker_partial}" "${RETAINED_DUMP_MARKER}"

validation_errors="$(psql_osm --tuples-only --no-align --command="
SELECT
    (SELECT count(*) FROM osm_pipeline.changesets_stage)
  + (SELECT count(*) FROM osm_pipeline.changesets_dump_stage)
  + (SELECT count(*) FROM osm_history.changeset_comments AS comments
     LEFT JOIN osm_history.changesets AS parents ON parents.id = comments.changeset_id
     WHERE parents.id IS NULL)
  + (SELECT count(*) FROM osm_pipeline.feed_changeset_comments AS comments
     LEFT JOIN osm_pipeline.feed_changesets AS parents ON parents.id = comments.changeset_id
     WHERE parents.id IS NULL)
")"
[[ "${validation_errors}" == 0 ]] || die 'Focused post-refresh changeset validation failed'
[[ "$(state_sequence "${CHANGESET_STATE}")" == "${live_cursor_before}" ]] \
    || die 'Changeset refresh altered the live consumer cursor'
[[ "$(psql_osm --tuples-only --no-align --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_applied_sequence'")" == "${database_cursor_before}" ]] \
    || die 'Changeset refresh altered the database consumer cursor'

if [[ "${old_dump_path}" != "${new_dump_path}" ]]; then
    rm --force -- "${old_dump_path}" "${old_dump_path}.md5"
fi
rm --force -- "${REFRESH_RESULT}" "${REFRESH_HTTP_METADATA}"
log "Retained changeset discussion dump refreshed to ${new_dump_timestamp}; live cursor unchanged at ${live_cursor_before}"
