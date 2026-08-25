\set ON_ERROR_STOP on

INSERT INTO osm_pipeline.global_alpr_node_ids (
    node_id,
    first_seen_version,
    last_seen_version,
    first_seen_at,
    last_seen_at
)
SELECT
    node_id,
    min(osm_version),
    max(osm_version),
    min(osm_updated_at),
    max(osm_updated_at)
FROM osm_pipeline.node_versions_stage
WHERE tags ->> 'surveillance:type' = 'ALPR'
GROUP BY node_id
ON CONFLICT (node_id) DO UPDATE SET
    first_seen_version = least(
        osm_pipeline.global_alpr_node_ids.first_seen_version,
        EXCLUDED.first_seen_version
    ),
    last_seen_version = greatest(
        osm_pipeline.global_alpr_node_ids.last_seen_version,
        EXCLUDED.last_seen_version
    ),
    first_seen_at = least(
        osm_pipeline.global_alpr_node_ids.first_seen_at,
        EXCLUDED.first_seen_at
    ),
    last_seen_at = greatest(
        osm_pipeline.global_alpr_node_ids.last_seen_at,
        EXCLUDED.last_seen_at
    ),
    updated_at = clock_timestamp();
