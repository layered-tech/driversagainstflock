\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('daf-osm-publish-current', 0));

DO $publication_guard$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM osm_ingest.alpr_nodes_stage) THEN
        RAISE EXCEPTION 'Refusing to publish an empty ALPR staging table';
    END IF;
END
$publication_guard$;

INSERT INTO osm_pipeline.replication_runs (
    stream,
    sequence_number,
    status
)
VALUES (
    'publication',
    :replication_sequence,
    'running'
)
RETURNING id AS publication_run_id
\gset

WITH enriched AS (
    SELECT
        staged.node_id,
        ST_X(staged.geom) AS longitude,
        ST_Y(staged.geom) AS latitude,
        staged.geom,
        staged.tags,
        staged.surveillance,
        staged.surveillance_type,
        staged.direction,
        staged.camera_direction,
        COALESCE(staged.osm_version, history.osm_version) AS osm_version,
        COALESCE(staged.osm_updated_at, history.osm_updated_at) AS osm_updated_at,
        COALESCE(staged.changeset_id, history.changeset_id) AS changeset_id,
        COALESCE(staged.osm_uid, history.osm_uid) AS osm_uid,
        COALESCE(staged.osm_user, history.osm_user) AS osm_user
    FROM osm_ingest.alpr_nodes_stage AS staged
    LEFT JOIN LATERAL (
        SELECT
            versions.osm_version,
            versions.osm_updated_at,
            versions.changeset_id,
            versions.osm_uid,
            versions.osm_user
        FROM osm_history.alpr_node_versions AS versions
        WHERE versions.node_id = staged.node_id
          AND (
              staged.osm_version IS NULL
              OR versions.osm_version = staged.osm_version
          )
        ORDER BY
            (versions.osm_version = staged.osm_version) DESC,
            versions.osm_version DESC
        LIMIT 1
    ) AS history ON true
)
INSERT INTO osm_current.alpr_nodes (
    node_id,
    longitude,
    latitude,
    geom,
    tags,
    surveillance,
    surveillance_type,
    direction,
    camera_direction,
    osm_version,
    osm_updated_at,
    changeset_id,
    osm_uid,
    osm_user,
    source_replication_sequence,
    source_timestamp,
    published_at
)
SELECT
    node_id,
    longitude,
    latitude,
    geom,
    tags,
    surveillance,
    surveillance_type,
    direction,
    camera_direction,
    osm_version,
    osm_updated_at,
    changeset_id,
    osm_uid,
    osm_user,
    :replication_sequence,
    :'source_timestamp'::timestamptz,
    clock_timestamp()
FROM enriched
ON CONFLICT (node_id) DO UPDATE SET
    longitude = EXCLUDED.longitude,
    latitude = EXCLUDED.latitude,
    geom = EXCLUDED.geom,
    tags = EXCLUDED.tags,
    surveillance = EXCLUDED.surveillance,
    surveillance_type = EXCLUDED.surveillance_type,
    direction = EXCLUDED.direction,
    camera_direction = EXCLUDED.camera_direction,
    osm_version = EXCLUDED.osm_version,
    osm_updated_at = EXCLUDED.osm_updated_at,
    changeset_id = EXCLUDED.changeset_id,
    osm_uid = EXCLUDED.osm_uid,
    osm_user = EXCLUDED.osm_user,
    source_replication_sequence = EXCLUDED.source_replication_sequence,
    source_timestamp = EXCLUDED.source_timestamp,
    published_at = EXCLUDED.published_at;

DELETE FROM osm_current.alpr_nodes AS published
WHERE NOT EXISTS (
    SELECT 1
    FROM osm_ingest.alpr_nodes_stage AS staged
    WHERE staged.node_id = published.node_id
);

INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('current_applied_sequence', :'replication_sequence'),
    ('current_source_timestamp', :'source_timestamp'),
    ('last_successful_replication_unix_time', extract(epoch FROM clock_timestamp())::bigint::text)
ON CONFLICT (state_key) DO UPDATE SET
    state_value = EXCLUDED.state_value,
    updated_at = clock_timestamp();

DO $parity_guard$
DECLARE
    staged_count bigint;
    published_count bigint;
BEGIN
    SELECT count(*) INTO staged_count FROM osm_ingest.alpr_nodes_stage;
    SELECT count(*) INTO published_count FROM osm_current.alpr_nodes;

    IF staged_count <> published_count THEN
        RAISE EXCEPTION
            'Publication parity mismatch: staging %, published %',
            staged_count,
            published_count;
    END IF;
END
$parity_guard$;

UPDATE osm_pipeline.replication_runs
SET
    status = 'succeeded',
    completed_at = clock_timestamp(),
    detail = 'current ALPR state published'
WHERE id = :publication_run_id;

COMMIT;
