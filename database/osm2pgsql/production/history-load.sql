\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('daf-osm-history-load', 0));

\ir discover-history-candidates.sql

INSERT INTO osm_history.alpr_node_versions (
    node_id,
    osm_version,
    visible,
    longitude,
    latitude,
    geom,
    tags,
    osm_updated_at,
    changeset_id,
    osm_uid,
    osm_user,
    source,
    replication_sequence
)
SELECT
    staged.node_id,
    staged.osm_version,
    staged.visible,
    staged.longitude,
    staged.latitude,
    CASE
        WHEN staged.longitude IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(staged.longitude, staged.latitude), 4326)
    END,
    staged.tags,
    staged.osm_updated_at,
    staged.changeset_id,
    staged.osm_uid,
    staged.osm_user,
    staged.source,
    staged.replication_sequence
FROM osm_pipeline.node_versions_stage AS staged
INNER JOIN osm_history.tracked_nodes AS tracked
    ON tracked.node_id = staged.node_id
ON CONFLICT (node_id, osm_version) DO UPDATE SET
    visible = EXCLUDED.visible,
    longitude = EXCLUDED.longitude,
    latitude = EXCLUDED.latitude,
    geom = EXCLUDED.geom,
    tags = EXCLUDED.tags,
    osm_uid = COALESCE(EXCLUDED.osm_uid, osm_history.alpr_node_versions.osm_uid),
    osm_user = COALESCE(EXCLUDED.osm_user, osm_history.alpr_node_versions.osm_user),
    changeset_id = EXCLUDED.changeset_id,
    osm_updated_at = EXCLUDED.osm_updated_at,
    replication_sequence = COALESCE(EXCLUDED.replication_sequence, osm_history.alpr_node_versions.replication_sequence);

UPDATE osm_history.tracked_nodes AS tracked
SET
    first_alpr_at = stats.first_alpr_at,
    last_alpr_at = stats.last_alpr_at,
    updated_at = clock_timestamp()
FROM (
    SELECT
        node_id,
        min(osm_updated_at) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR') AS first_alpr_at,
        max(osm_updated_at) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR') AS last_alpr_at
    FROM osm_history.alpr_node_versions
    WHERE node_id IN (SELECT DISTINCT node_id FROM osm_pipeline.node_versions_stage)
    GROUP BY node_id
) AS stats
WHERE tracked.node_id = stats.node_id;

TRUNCATE osm_pipeline.node_versions_stage;

COMMIT;
