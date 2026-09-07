\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('daf-osm-changeset-load', 0));

CREATE TEMP TABLE minute_changeset_snapshots ON COMMIT DROP AS
SELECT DISTINCT ON (osm_changeset_id) *
FROM osm_pipeline.changesets_stage
ORDER BY osm_changeset_id, ordinal DESC;

CREATE TEMP TABLE accepted_feed_changesets ON COMMIT DROP AS
SELECT incoming.*
FROM minute_changeset_snapshots AS incoming
LEFT JOIN osm_pipeline.feed_changesets AS stored
    ON stored.osm_changeset_id = incoming.osm_changeset_id
WHERE stored.id IS NULL OR incoming.observed_at >= stored.observed_at;

INSERT INTO osm_pipeline.feed_changesets (
    osm_changeset_id,
    created_at,
    closed_at,
    open,
    num_changes,
    comments_count,
    osm_uid,
    osm_user,
    min_lon,
    min_lat,
    max_lon,
    max_lat,
    bbox,
    tags,
    source,
    replication_sequence,
    observed_at
)
SELECT
    osm_changeset_id,
    created_at,
    closed_at,
    open,
    num_changes,
    comments_count,
    osm_uid,
    osm_user,
    min_lon,
    min_lat,
    max_lon,
    max_lat,
    CASE
        WHEN min_lon IS NULL THEN NULL
        ELSE ST_Envelope(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))
    END,
    tags,
    source,
    replication_sequence,
    observed_at
FROM accepted_feed_changesets
ON CONFLICT (osm_changeset_id) DO UPDATE SET
    created_at = EXCLUDED.created_at,
    closed_at = EXCLUDED.closed_at,
    open = EXCLUDED.open,
    num_changes = EXCLUDED.num_changes,
    comments_count = EXCLUDED.comments_count,
    osm_uid = EXCLUDED.osm_uid,
    osm_user = EXCLUDED.osm_user,
    min_lon = EXCLUDED.min_lon,
    min_lat = EXCLUDED.min_lat,
    max_lon = EXCLUDED.max_lon,
    max_lat = EXCLUDED.max_lat,
    bbox = EXCLUDED.bbox,
    tags = EXCLUDED.tags,
    source = EXCLUDED.source,
    replication_sequence = EXCLUDED.replication_sequence,
    observed_at = EXCLUDED.observed_at,
    updated_at = clock_timestamp()
WHERE EXCLUDED.observed_at >= osm_pipeline.feed_changesets.observed_at;

DELETE FROM osm_pipeline.feed_changeset_comments AS stored_comment
USING osm_pipeline.feed_changesets AS parent, accepted_feed_changesets AS accepted
WHERE parent.osm_changeset_id = accepted.osm_changeset_id
  AND stored_comment.changeset_id = parent.id
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(accepted.discussion) AS supplied(comment)
      WHERE (supplied.comment ->> 'ordinal')::integer = stored_comment.ordinal
  );

INSERT INTO osm_pipeline.feed_changeset_comments (
    changeset_id,
    osm_comment_id,
    ordinal,
    commented_at,
    osm_uid,
    osm_user,
    visible,
    body,
    replication_sequence,
    observed_at
)
SELECT
    parent.id,
    supplied.comment_id,
    supplied.ordinal,
    supplied.commented_at,
    supplied.osm_uid,
    supplied.osm_user,
    supplied.visible,
    supplied.body,
    accepted.replication_sequence,
    accepted.observed_at
FROM accepted_feed_changesets AS accepted
INNER JOIN osm_pipeline.feed_changesets AS parent
    ON parent.osm_changeset_id = accepted.osm_changeset_id
CROSS JOIN LATERAL jsonb_to_recordset(accepted.discussion) AS supplied(
    comment_id bigint,
    ordinal integer,
    commented_at timestamptz,
    osm_uid bigint,
    osm_user text,
    visible boolean,
    body text
)
ON CONFLICT (changeset_id, ordinal) DO UPDATE SET
    osm_comment_id = EXCLUDED.osm_comment_id,
    commented_at = EXCLUDED.commented_at,
    osm_uid = EXCLUDED.osm_uid,
    osm_user = EXCLUDED.osm_user,
    visible = EXCLUDED.visible,
    body = EXCLUDED.body,
    replication_sequence = EXCLUDED.replication_sequence,
    observed_at = EXCLUDED.observed_at,
    updated_at = clock_timestamp();

CREATE TEMP TABLE tracked_changeset_ids ON COMMIT DROP AS
SELECT changeset_id AS osm_changeset_id
FROM osm_history.alpr_node_versions
WHERE changeset_id IS NOT NULL
UNION
SELECT changeset_id AS osm_changeset_id
FROM osm_current.alpr_nodes
WHERE changeset_id IS NOT NULL;

CREATE UNIQUE INDEX tracked_changeset_ids_unique
    ON tracked_changeset_ids (osm_changeset_id);

CREATE TEMP TABLE accepted_history_changesets ON COMMIT DROP AS
SELECT incoming.*
FROM minute_changeset_snapshots AS incoming
INNER JOIN tracked_changeset_ids AS tracked
    USING (osm_changeset_id)
LEFT JOIN osm_history.changesets AS stored
    ON stored.osm_changeset_id = incoming.osm_changeset_id
WHERE stored.id IS NULL OR incoming.observed_at >= stored.observed_at;

INSERT INTO osm_history.changesets (
    osm_changeset_id,
    created_at,
    closed_at,
    open,
    num_changes,
    comments_count,
    osm_uid,
    osm_user,
    min_lon,
    min_lat,
    max_lon,
    max_lat,
    bbox,
    tags,
    source,
    replication_sequence,
    observed_at
)
SELECT
    osm_changeset_id,
    created_at,
    closed_at,
    open,
    num_changes,
    comments_count,
    osm_uid,
    osm_user,
    min_lon,
    min_lat,
    max_lon,
    max_lat,
    CASE
        WHEN min_lon IS NULL THEN NULL
        ELSE ST_Envelope(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))
    END,
    tags,
    source,
    replication_sequence,
    observed_at
FROM accepted_history_changesets
ON CONFLICT (osm_changeset_id) DO UPDATE SET
    created_at = EXCLUDED.created_at,
    closed_at = EXCLUDED.closed_at,
    open = EXCLUDED.open,
    num_changes = EXCLUDED.num_changes,
    comments_count = EXCLUDED.comments_count,
    osm_uid = EXCLUDED.osm_uid,
    osm_user = EXCLUDED.osm_user,
    min_lon = EXCLUDED.min_lon,
    min_lat = EXCLUDED.min_lat,
    max_lon = EXCLUDED.max_lon,
    max_lat = EXCLUDED.max_lat,
    bbox = EXCLUDED.bbox,
    tags = EXCLUDED.tags,
    source = EXCLUDED.source,
    replication_sequence = EXCLUDED.replication_sequence,
    observed_at = EXCLUDED.observed_at,
    updated_at = clock_timestamp()
WHERE EXCLUDED.observed_at >= osm_history.changesets.observed_at;

DELETE FROM osm_history.changeset_comments AS stored_comment
USING osm_history.changesets AS parent, accepted_history_changesets AS accepted
WHERE parent.osm_changeset_id = accepted.osm_changeset_id
  AND stored_comment.changeset_id = parent.id
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(accepted.discussion) AS supplied(comment)
      WHERE (supplied.comment ->> 'ordinal')::integer = stored_comment.ordinal
  );

INSERT INTO osm_history.changeset_comments (
    changeset_id,
    osm_comment_id,
    ordinal,
    commented_at,
    osm_uid,
    osm_user,
    visible,
    body,
    replication_sequence,
    observed_at
)
SELECT
    parent.id,
    supplied.comment_id,
    supplied.ordinal,
    supplied.commented_at,
    supplied.osm_uid,
    supplied.osm_user,
    supplied.visible,
    supplied.body,
    accepted.replication_sequence,
    accepted.observed_at
FROM accepted_history_changesets AS accepted
INNER JOIN osm_history.changesets AS parent
    ON parent.osm_changeset_id = accepted.osm_changeset_id
CROSS JOIN LATERAL jsonb_to_recordset(accepted.discussion) AS supplied(
    comment_id bigint,
    ordinal integer,
    commented_at timestamptz,
    osm_uid bigint,
    osm_user text,
    visible boolean,
    body text
)
ON CONFLICT (changeset_id, ordinal) DO UPDATE SET
    osm_comment_id = EXCLUDED.osm_comment_id,
    commented_at = EXCLUDED.commented_at,
    osm_uid = EXCLUDED.osm_uid,
    osm_user = EXCLUDED.osm_user,
    visible = EXCLUDED.visible,
    body = EXCLUDED.body,
    replication_sequence = EXCLUDED.replication_sequence,
    observed_at = EXCLUDED.observed_at,
    updated_at = clock_timestamp();

CREATE TEMP TABLE promoted_feed_changesets ON COMMIT DROP AS
SELECT buffered.*
FROM osm_pipeline.feed_changesets AS buffered
INNER JOIN tracked_changeset_ids AS tracked
    USING (osm_changeset_id)
WHERE NOT EXISTS (
    SELECT 1
    FROM osm_history.changesets AS published
    WHERE published.osm_changeset_id = buffered.osm_changeset_id
);

INSERT INTO osm_history.changesets (
    osm_changeset_id,
    created_at,
    closed_at,
    open,
    num_changes,
    comments_count,
    osm_uid,
    osm_user,
    min_lon,
    min_lat,
    max_lon,
    max_lat,
    bbox,
    tags,
    source,
    replication_sequence,
    observed_at
)
SELECT
    osm_changeset_id,
    created_at,
    closed_at,
    open,
    num_changes,
    comments_count,
    osm_uid,
    osm_user,
    min_lon,
    min_lat,
    max_lon,
    max_lat,
    bbox,
    tags,
    source,
    replication_sequence,
    observed_at
FROM promoted_feed_changesets
ON CONFLICT (osm_changeset_id) DO NOTHING;

INSERT INTO osm_history.changeset_comments (
    changeset_id,
    osm_comment_id,
    ordinal,
    commented_at,
    osm_uid,
    osm_user,
    visible,
    body,
    replication_sequence,
    observed_at
)
SELECT
    published.id,
    buffered_comment.osm_comment_id,
    buffered_comment.ordinal,
    buffered_comment.commented_at,
    buffered_comment.osm_uid,
    buffered_comment.osm_user,
    buffered_comment.visible,
    buffered_comment.body,
    buffered_comment.replication_sequence,
    buffered_comment.observed_at
FROM promoted_feed_changesets AS promoted
INNER JOIN osm_pipeline.feed_changeset_comments AS buffered_comment
    ON buffered_comment.changeset_id = promoted.id
INNER JOIN osm_history.changesets AS published
    ON published.osm_changeset_id = promoted.osm_changeset_id
ON CONFLICT (changeset_id, ordinal) DO UPDATE SET
    osm_comment_id = EXCLUDED.osm_comment_id,
    commented_at = EXCLUDED.commented_at,
    osm_uid = EXCLUDED.osm_uid,
    osm_user = EXCLUDED.osm_user,
    visible = EXCLUDED.visible,
    body = EXCLUDED.body,
    replication_sequence = EXCLUDED.replication_sequence,
    observed_at = EXCLUDED.observed_at,
    updated_at = clock_timestamp();

INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('changeset_applied_sequence', :'replication_sequence'),
    ('changeset_source_timestamp', :'source_timestamp')
ON CONFLICT (state_key) DO UPDATE SET
    state_value = EXCLUDED.state_value,
    updated_at = clock_timestamp();

TRUNCATE osm_pipeline.changesets_stage;

COMMIT;
