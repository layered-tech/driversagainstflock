\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('daf-osm-changeset-load', 0));

CREATE TEMP TABLE dump_changeset_snapshots ON COMMIT DROP AS
SELECT DISTINCT ON (osm_changeset_id) *
FROM osm_pipeline.changesets_dump_stage
ORDER BY osm_changeset_id, ordinal DESC;

CREATE TEMP TABLE accepted_dump_changesets ON COMMIT DROP AS
SELECT incoming.*
FROM dump_changeset_snapshots AS incoming
INNER JOIN (
    SELECT changeset_id AS osm_changeset_id
    FROM osm_history.alpr_node_versions
    WHERE changeset_id IS NOT NULL
    UNION
    SELECT changeset_id AS osm_changeset_id
    FROM osm_current.alpr_nodes
    WHERE changeset_id IS NOT NULL
) AS tracked USING (osm_changeset_id)
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
FROM accepted_dump_changesets
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
USING osm_history.changesets AS parent, accepted_dump_changesets AS accepted
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
FROM accepted_dump_changesets AS accepted
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

TRUNCATE osm_pipeline.changesets_dump_stage;

COMMIT;
