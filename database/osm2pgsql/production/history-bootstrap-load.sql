\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('daf-osm-history-load', 0));

INSERT INTO osm_history.tracked_nodes (
    node_id,
    first_alpr_at,
    last_alpr_at,
    region_confirmed_at,
    api_backfilled_at
)
SELECT
    node_id,
    min(osm_updated_at) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR'),
    max(osm_updated_at) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR'),
    clock_timestamp(),
    CASE
        WHEN bool_or(source = 'api_backfill') THEN clock_timestamp()
        ELSE NULL
    END
FROM osm_pipeline.node_versions_stage
GROUP BY node_id
HAVING bool_or(tags ->> 'surveillance:type' = 'ALPR')
ON CONFLICT (node_id) DO UPDATE SET
    first_alpr_at = COALESCE(
        least(osm_history.tracked_nodes.first_alpr_at, EXCLUDED.first_alpr_at),
        osm_history.tracked_nodes.first_alpr_at,
        EXCLUDED.first_alpr_at
    ),
    last_alpr_at = COALESCE(
        greatest(osm_history.tracked_nodes.last_alpr_at, EXCLUDED.last_alpr_at),
        osm_history.tracked_nodes.last_alpr_at,
        EXCLUDED.last_alpr_at
    ),
    region_confirmed_at = least(
        osm_history.tracked_nodes.region_confirmed_at,
        EXCLUDED.region_confirmed_at
    ),
    api_backfilled_at = COALESCE(
        EXCLUDED.api_backfilled_at,
        osm_history.tracked_nodes.api_backfilled_at
    ),
    updated_at = clock_timestamp();

INSERT INTO osm_pipeline.global_alpr_node_ids (
    node_id,
    first_seen_version,
    last_seen_version,
    first_seen_at,
    last_seen_at,
    last_region_check_version,
    last_region_checked_at
)
SELECT
    node_id,
    min(osm_version) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR'),
    max(osm_version) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR'),
    min(osm_updated_at) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR'),
    max(osm_updated_at) FILTER (WHERE tags ->> 'surveillance:type' = 'ALPR'),
    max(osm_version),
    clock_timestamp()
FROM osm_pipeline.node_versions_stage
GROUP BY node_id
HAVING bool_or(tags ->> 'surveillance:type' = 'ALPR')
ON CONFLICT (node_id) DO UPDATE SET
    first_seen_version = COALESCE(
        least(osm_pipeline.global_alpr_node_ids.first_seen_version, EXCLUDED.first_seen_version),
        osm_pipeline.global_alpr_node_ids.first_seen_version,
        EXCLUDED.first_seen_version
    ),
    last_seen_version = COALESCE(
        greatest(osm_pipeline.global_alpr_node_ids.last_seen_version, EXCLUDED.last_seen_version),
        osm_pipeline.global_alpr_node_ids.last_seen_version,
        EXCLUDED.last_seen_version
    ),
    first_seen_at = COALESCE(
        least(osm_pipeline.global_alpr_node_ids.first_seen_at, EXCLUDED.first_seen_at),
        osm_pipeline.global_alpr_node_ids.first_seen_at,
        EXCLUDED.first_seen_at
    ),
    last_seen_at = COALESCE(
        greatest(osm_pipeline.global_alpr_node_ids.last_seen_at, EXCLUDED.last_seen_at),
        osm_pipeline.global_alpr_node_ids.last_seen_at,
        EXCLUDED.last_seen_at
    ),
    last_region_check_version = COALESCE(
        greatest(osm_pipeline.global_alpr_node_ids.last_region_check_version, EXCLUDED.last_region_check_version),
        osm_pipeline.global_alpr_node_ids.last_region_check_version,
        EXCLUDED.last_region_check_version
    ),
    last_region_checked_at = clock_timestamp(),
    updated_at = clock_timestamp();

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

TRUNCATE osm_pipeline.node_versions_stage;

COMMIT;
