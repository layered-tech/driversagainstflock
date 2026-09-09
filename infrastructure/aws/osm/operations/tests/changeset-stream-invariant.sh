#!/usr/bin/env bash

set -Eeuo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_DIRECTORY="$(cd "${TEST_DIRECTORY}/../../../../.." && pwd)"
readonly DATABASE_DIRECTORY="${REPOSITORY_DIRECTORY}/database/osm2pgsql/production"

work_directory="$(mktemp -d)"
trap 'pg_ctl --pgdata "${work_directory}/postgres" --mode fast stop >/dev/null 2>&1 || true; rm -rf -- "${work_directory}"' EXIT

initdb --pgdata "${work_directory}/postgres" --auth=trust --no-locale >/dev/null
pg_ctl --pgdata "${work_directory}/postgres" \
    --options="-c listen_addresses='' -k ${work_directory}" \
    --wait start >/dev/null

export PGHOST="${work_directory}"
export PGDATABASE=postgres
export PGUSER="$(id -un)"

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'SCHEMA_SQL'
CREATE SCHEMA osm_pipeline;
CREATE SCHEMA osm_current;
CREATE SCHEMA osm_history;

CREATE FUNCTION ST_MakeEnvelope(double precision, double precision, double precision, double precision, integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT concat_ws(',', $1, $2, $3, $4, $5) $$;
CREATE FUNCTION ST_Envelope(text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;

CREATE TABLE osm_pipeline.state (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    state_key text NOT NULL UNIQUE,
    state_value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE osm_history.alpr_node_versions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL,
    osm_version integer NOT NULL,
    visible boolean NOT NULL,
    changeset_id bigint,
    osm_updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE osm_current.alpr_nodes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL,
    changeset_id bigint
);

CREATE TABLE osm_history.changesets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    osm_changeset_id bigint NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    closed_at timestamptz,
    open boolean NOT NULL,
    num_changes integer,
    comments_count integer,
    osm_uid bigint,
    osm_user text,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision,
    bbox text,
    tags jsonb NOT NULL,
    source text NOT NULL,
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE osm_history.changeset_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changeset_id bigint NOT NULL REFERENCES osm_history.changesets (id) ON DELETE CASCADE,
    osm_comment_id bigint,
    ordinal integer NOT NULL,
    commented_at timestamptz NOT NULL,
    osm_uid bigint,
    osm_user text,
    visible boolean,
    body text NOT NULL,
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (changeset_id, osm_comment_id),
    UNIQUE (changeset_id, ordinal)
);
CREATE TABLE osm_pipeline.feed_changesets (LIKE osm_history.changesets INCLUDING ALL);
CREATE TABLE osm_pipeline.feed_changeset_comments (LIKE osm_history.changeset_comments INCLUDING ALL);
ALTER TABLE osm_pipeline.feed_changeset_comments
    ADD FOREIGN KEY (changeset_id) REFERENCES osm_pipeline.feed_changesets (id) ON DELETE CASCADE;

CREATE UNLOGGED TABLE osm_pipeline.changesets_stage (
    ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    osm_changeset_id bigint NOT NULL,
    created_at timestamptz NOT NULL,
    closed_at timestamptz,
    open boolean NOT NULL,
    num_changes integer,
    comments_count integer,
    osm_uid bigint,
    osm_user text,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision,
    bbox text,
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL,
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    discussion jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE UNLOGGED TABLE osm_pipeline.changesets_dump_stage
    (LIKE osm_pipeline.changesets_stage INCLUDING ALL);
SCHEMA_SQL

python3 "${TEST_DIRECTORY}/changeset-query-invocation.py"

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --file=<(sed -n \
        '/^CREATE OR REPLACE VIEW osm_history.application_changesets AS$/,/^    ON discussion_counts.changeset_id = changesets.id;$/p' \
        "${DATABASE_DIRECTORY}/schema-base.sql") \
    >/dev/null

assert_sql()
{
    local expected="$1"
    local query="$2"
    local actual

    actual="$(psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="${query}")"
    [[ "${actual}" == "${expected}" ]] || {
        echo "SQL invariant failed: expected ${expected}, found ${actual}" >&2
        exit 1
    }
}

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'FIRST_SNAPSHOT_SQL'
INSERT INTO osm_history.alpr_node_versions (node_id, osm_version, visible, changeset_id)
VALUES (1, 1, true, 100);

INSERT INTO osm_pipeline.changesets_stage (
    osm_changeset_id, created_at, closed_at, open, num_changes, comments_count,
    osm_uid, osm_user, min_lon, min_lat, max_lon, max_lat, tags, source,
    replication_sequence, observed_at, discussion
) VALUES
(
    100, '2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', false, 2, 1,
    10, 'older', NULL, NULL, NULL, NULL, '{"comment":"older"}', 'minute_diff',
    1, '2026-09-06T00:10:00Z', '[]'
),
(
    100, '2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', false, 3, 2,
    11, 'newer', -91, 30, -90, 31, '{"comment":"newer"}', 'minute_diff',
    2, '2026-09-06T00:11:00Z',
    '[{"comment_id":null,"ordinal":0,"commented_at":"2026-09-06T00:01:00Z","osm_uid":20,"osm_user":"one","visible":true,"body":"first"},{"comment_id":null,"ordinal":1,"commented_at":"2026-09-06T00:02:00Z","osm_uid":21,"osm_user":"two","visible":true,"body":"second"}]'
),
(
    200, '2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', false, 1, 1,
    NULL, NULL, NULL, NULL, NULL, NULL, '{}', 'minute_diff',
    2, '2026-09-06T00:11:00Z',
    '[{"comment_id":null,"ordinal":0,"commented_at":"2026-09-06T00:03:00Z","osm_uid":null,"osm_user":null,"visible":null,"body":"buffered"}]'
);
FIRST_SNAPSHOT_SQL

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --set=replication_sequence=2 \
    --set=source_timestamp=2026-09-06T00:11:00Z \
    --file="${DATABASE_DIRECTORY}/changesets-load.sql" >/dev/null

assert_sql '2' 'SELECT count(*) FROM osm_pipeline.feed_changesets'
assert_sql '3' 'SELECT count(*) FROM osm_pipeline.feed_changeset_comments'
assert_sql '1' 'SELECT count(*) FROM osm_history.changesets'
assert_sql '2' 'SELECT count(*) FROM osm_history.changeset_comments'
assert_sql '2' 'SELECT count(*) FROM osm_history.changeset_comments WHERE osm_comment_id IS NULL'
assert_sql '3|newer' "SELECT num_changes || '|' || osm_user FROM osm_history.changesets WHERE osm_changeset_id = 100"
assert_sql '0' 'SELECT count(*) FROM osm_pipeline.changesets_stage'

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'REEMISSION_SQL'
INSERT INTO osm_pipeline.changesets_stage (
    osm_changeset_id, created_at, closed_at, open, comments_count, tags, source,
    replication_sequence, observed_at, discussion
) VALUES (
    100, '2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', false, 2, '{}',
    'minute_diff', 3, '2026-09-06T00:12:00Z',
    '[{"comment_id":2,"ordinal":0,"commented_at":"2026-09-06T00:02:00Z","osm_uid":22,"osm_user":"updated","visible":false,"body":"second updated"},{"comment_id":4,"ordinal":1,"commented_at":"2026-09-06T00:04:00Z","osm_uid":null,"osm_user":null,"visible":true,"body":"fourth"}]'
);
REEMISSION_SQL

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --set=replication_sequence=3 \
    --set=source_timestamp=2026-09-06T00:12:00Z \
    --file="${DATABASE_DIRECTORY}/changesets-load.sql" >/dev/null

assert_sql '2,4' "SELECT string_agg(osm_comment_id::text, ',' ORDER BY ordinal) FROM osm_history.changeset_comments"
assert_sql 'false|updated|second updated' "SELECT visible || '|' || osm_user || '|' || body FROM osm_history.changeset_comments WHERE osm_comment_id = 2"

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'STALE_DUMP_SQL'
INSERT INTO osm_pipeline.changesets_dump_stage (
    osm_changeset_id, created_at, closed_at, open, comments_count, tags, source,
    observed_at, discussion
) VALUES (
    100, '2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', false, 1, '{}',
    'discussion_dump', '2026-09-05T00:00:00Z',
    '[{"comment_id":9,"ordinal":0,"commented_at":"2026-09-05T00:01:00Z","osm_uid":null,"osm_user":null,"visible":true,"body":"stale"}]'
);
STALE_DUMP_SQL
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --file="${DATABASE_DIRECTORY}/changesets-bootstrap-load.sql" >/dev/null
assert_sql '2,4' "SELECT string_agg(osm_comment_id::text, ',' ORDER BY ordinal) FROM osm_history.changeset_comments"
assert_sql '0' 'SELECT count(*) FROM osm_pipeline.changesets_dump_stage'

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --command="INSERT INTO osm_history.alpr_node_versions (node_id, osm_version, visible, changeset_id) VALUES (2, 1, true, 200)" >/dev/null
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --set=replication_sequence=4 \
    --set=source_timestamp=2026-09-06T00:13:00Z \
    --file="${DATABASE_DIRECTORY}/changesets-load.sql" >/dev/null
assert_sql '2' 'SELECT count(*) FROM osm_history.changesets'
assert_sql '1' "SELECT count(*) FROM osm_history.changeset_comments AS comments INNER JOIN osm_history.changesets AS changesets ON changesets.id = comments.changeset_id WHERE changesets.osm_changeset_id = 200 AND comments.osm_comment_id IS NULL"

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'EMPTY_AND_BACKFILL_SQL'
INSERT INTO osm_pipeline.changesets_stage (
    osm_changeset_id, created_at, closed_at, open, comments_count, tags, source,
    replication_sequence, observed_at, discussion
) VALUES (
    100, '2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', false, 0, '{}',
    'minute_diff', 5, '2026-09-06T00:14:00Z', '[]'
);
INSERT INTO osm_history.alpr_node_versions (node_id, osm_version, visible, changeset_id)
VALUES (3, 1, true, 300);
INSERT INTO osm_pipeline.changesets_dump_stage (
    osm_changeset_id, created_at, closed_at, open, comments_count, tags, source,
    observed_at, discussion
) VALUES (
    300, '2026-08-01T00:00:00Z', '2026-08-01T00:10:00Z', false, 0, '{}',
    'discussion_dump', '2026-08-30T23:59:56Z', '[]'
);
EMPTY_AND_BACKFILL_SQL
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --set=replication_sequence=5 \
    --set=source_timestamp=2026-09-06T00:14:00Z \
    --file="${DATABASE_DIRECTORY}/changesets-load.sql" >/dev/null
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --file="${DATABASE_DIRECTORY}/changesets-bootstrap-load.sql" >/dev/null
assert_sql '0' "SELECT count(*) FROM osm_history.changeset_comments AS comments INNER JOIN osm_history.changesets AS changesets ON changesets.id = comments.changeset_id WHERE changesets.osm_changeset_id = 100"
assert_sql '1' 'SELECT count(*) FROM osm_history.changesets WHERE osm_changeset_id = 300'
assert_sql '0' 'SELECT count(*) FROM osm_history.changeset_comments AS comments LEFT JOIN osm_history.changesets AS changesets ON changesets.id = comments.changeset_id WHERE changesets.id IS NULL'

psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'DERIVED_COUNTS_SQL'
INSERT INTO osm_history.alpr_node_versions (node_id, osm_version, visible, changeset_id) VALUES
    (10, 1, true, 400),
    (10, 2, true, 400),
    (20, 2, true, 400),
    (20, 3, true, 400),
    (30, 1, true, 400),
    (30, 2, false, 400);
INSERT INTO osm_pipeline.changesets_dump_stage (
    osm_changeset_id, created_at, closed_at, open, num_changes, comments_count,
    tags, source, observed_at, discussion
) VALUES (
    400, '2026-08-01T00:00:00Z', '2026-08-01T00:10:00Z', false, 99, 0,
    '{}', 'discussion_dump', '2026-08-30T23:59:56Z', '[]'
);
DERIVED_COUNTS_SQL
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --file="${DATABASE_DIRECTORY}/changesets-bootstrap-load.sql" >/dev/null
assert_sql '1|1|1|3|99' "SELECT alpr_nodes_created || '|' || alpr_nodes_modified || '|' || alpr_nodes_deleted || '|' || alpr_nodes_touched || '|' || osm_num_changes FROM osm_history.application_changesets WHERE osm_changeset_id = 400"

for loader in changesets-load.sql changesets-bootstrap-load.sql; do
    rg --quiet "pg_advisory_xact_lock\(hashtextextended\('daf-osm-changeset-load', 0\)\)" \
        "${DATABASE_DIRECTORY}/${loader}"
done

pg_dump --format=custom \
    --schema=osm_pipeline \
    --schema=osm_history \
    --file="${work_directory}/changesets.dump" \
    postgres
createdb changeset_restore
pg_restore --no-owner --dbname=changeset_restore "${work_directory}/changesets.dump"
export PGDATABASE=changeset_restore
assert_sql '4|1|2|1' 'SELECT (SELECT count(*) FROM osm_history.changesets) || '\''|'\'' || (SELECT count(*) FROM osm_history.changeset_comments) || '\''|'\'' || (SELECT count(*) FROM osm_pipeline.feed_changesets) || '\''|'\'' || (SELECT count(*) FROM osm_pipeline.feed_changeset_comments)'
assert_sql '5' "SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_applied_sequence'"
assert_sql '0' 'SELECT count(*) FROM osm_history.changeset_comments comments LEFT JOIN osm_history.changesets parents ON parents.id = comments.changeset_id WHERE parents.id IS NULL'
assert_sql '0' 'SELECT count(*) FROM (SELECT changeset_id, ordinal FROM osm_history.changeset_comments GROUP BY changeset_id, ordinal HAVING count(*) > 1) duplicates'

for backup_contract in \
    changeset_replication_sequence \
    pre_dump_changeset_count \
    pre_dump_changeset_comment_count \
    pre_dump_feed_changeset_count \
    pre_dump_feed_changeset_comment_count; do
    rg --quiet "${backup_contract}" "${REPOSITORY_DIRECTORY}/infrastructure/aws/osm/operations/bin/backup-core.sh"
done

echo 'changeset-stream-invariant: PASS'
