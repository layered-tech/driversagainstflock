#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OPERATIONS_DIRECTORY="$(cd "${TEST_DIRECTORY}/.." && pwd)"
readonly REFRESH_SCRIPT="${OPERATIONS_DIRECTORY}/bin/refresh-changesets.sh"
readonly CORE_SCRIPT="${OPERATIONS_DIRECTORY}/bin/bootstrap-changesets-core.sh"

fail()
{
    printf 'changeset-refresh-invariant: FAIL: %s\n' "$*" >&2
    exit 1
}

require_contract()
{
    local path="$1"
    local contract="$2"

    grep --fixed-strings --quiet "${contract}" "${path}" \
        || fail "missing contract '${contract}' in $(basename "${path}")"
}

bash -n "${REFRESH_SCRIPT}"
bash -n "${CORE_SCRIPT}"

for contract in \
    'daf-osm-changeset-update.timer' \
    'daf-osm-changeset-backfill.timer' \
    '/run/daf-osm/backup.lock' \
    '/run/daf-osm/global-changeset.lock' \
    '/run/daf-osm/global-changeset-backfill.lock' \
    'bootstrap-changesets-core.sh --mode refresh' \
    'DELETE FROM osm_pipeline.feed_changesets' \
    "state_key = 'changeset_applied_sequence'" \
    'restore_timers'; do
    require_contract "${REFRESH_SCRIPT}" "${contract}"
done

for contract in \
    'previous_dump_timestamp' \
    "changeset_dump_replay_sequence" \
    'changesets-bootstrap-load.sql' \
    'PENDING_RESULT'; do
    require_contract "${CORE_SCRIPT}" "${contract}"
done

refresh_lock_line="$(grep --line-number --fixed-strings '/run/daf-osm/global-changeset.lock' "${REFRESH_SCRIPT}" | head --lines=1 | cut -d: -f1)"
backfill_lock_line="$(grep --line-number --fixed-strings '/run/daf-osm/global-changeset-backfill.lock' "${REFRESH_SCRIPT}" | head --lines=1 | cut -d: -f1)"
(( refresh_lock_line < backfill_lock_line )) \
    || fail 'refresh does not acquire changeset writer locks in canonical order'

grep --after-context=1 --fixed-strings 'DELETE FROM osm_pipeline.feed_changesets' "${REFRESH_SCRIPT}" \
    | grep --fixed-strings --quiet "WHERE observed_at <= :'dump_timestamp'::timestamptz" \
    || fail 'refresh does not preserve feed rows observed after the new snapshot'

if grep --extended-regexp --quiet "(UPDATE|INSERT).*changeset_applied_sequence" "${REFRESH_SCRIPT}"; then
    fail 'refresh may mutate the independent live changeset cursor'
fi

work_directory="$(mktemp -d)"
trap 'pg_ctl --pgdata "${work_directory}/postgres" --mode fast stop >/dev/null 2>&1 || true; rm -rf -- "${work_directory}"' EXIT
initdb --pgdata "${work_directory}/postgres" --auth=trust --no-locale >/dev/null
pg_ctl --pgdata "${work_directory}/postgres" \
    --options="-c listen_addresses='' -k ${work_directory}" \
    --wait start >/dev/null
export PGHOST="${work_directory}"
export PGDATABASE=postgres
export PGUSER="$(id -un)"

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'REFRESH_FIXTURE_SQL' >/dev/null
CREATE SCHEMA osm_pipeline;
CREATE SCHEMA osm_history;
CREATE TABLE osm_pipeline.state (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    state_key text NOT NULL UNIQUE,
    state_value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE osm_pipeline.feed_changesets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    osm_changeset_id bigint NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    observed_at timestamptz NOT NULL
);
CREATE TABLE osm_pipeline.feed_changeset_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changeset_id bigint NOT NULL REFERENCES osm_pipeline.feed_changesets (id) ON DELETE CASCADE
);
CREATE TABLE osm_history.changesets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    osm_changeset_id bigint NOT NULL UNIQUE,
    observed_at timestamptz NOT NULL
);
CREATE TABLE osm_history.changeset_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changeset_id bigint NOT NULL REFERENCES osm_history.changesets (id) ON DELETE CASCADE
);
INSERT INTO osm_pipeline.state (state_key, state_value) VALUES
    ('changeset_applied_sequence', '700'),
    ('changeset_source_timestamp', '2026-09-06T01:00:00Z');
INSERT INTO osm_pipeline.feed_changesets (osm_changeset_id, created_at, observed_at) VALUES
    (1, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'),
    (2, '2026-08-01T00:00:00Z', '2026-09-05T00:00:01Z');
INSERT INTO osm_pipeline.feed_changeset_comments (changeset_id)
SELECT id FROM osm_pipeline.feed_changesets;
INSERT INTO osm_history.changesets (osm_changeset_id, observed_at)
VALUES (1, '2026-09-06T00:00:00Z');
INSERT INTO osm_history.changeset_comments (changeset_id)
SELECT id FROM osm_history.changesets;
REFRESH_FIXTURE_SQL

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --set=dump_url=https://example.invalid/discussions.osm.bz2 \
    --set=dump_md5=0123456789abcdef0123456789abcdef \
    --set=dump_timestamp=2026-09-05T00:00:00Z \
    --set=dump_max_id=2 \
    --set=replay_sequence=650 \
    --file=<(sed -n '/^BEGIN;$/,/^COMMIT;$/p' "${REFRESH_SCRIPT}") \
    >/dev/null

[[ "$(psql --no-psqlrc --tuples-only --no-align --command='SELECT string_agg(osm_changeset_id::text, '"'"','"'"' ORDER BY osm_changeset_id) FROM osm_pipeline.feed_changesets')" == 2 ]] \
    || fail 'refresh did not prune only feed parents observed through the snapshot'
[[ "$(psql --no-psqlrc --tuples-only --no-align --command='SELECT count(*) FROM osm_pipeline.feed_changeset_comments')" == 1 ]] \
    || fail 'refresh did not cascade comments only for pruned parents'
[[ "$(psql --no-psqlrc --tuples-only --no-align --command='SELECT count(*) FROM osm_history.changeset_comments')" == 1 ]] \
    || fail 'refresh pruning altered newer authoritative history discussion state'
[[ "$(psql --no-psqlrc --tuples-only --no-align --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_applied_sequence'")" == 700 ]] \
    || fail 'refresh changed the live database consumer cursor'

printf 'changeset-refresh-invariant: PASS\n'
