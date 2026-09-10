CREATE OR REPLACE VIEW osm_history.application_changesets AS
SELECT
    changesets.osm_changeset_id,
    changesets.osm_uid,
    changesets.osm_user,
    changesets.created_at,
    changesets.closed_at,
    changesets.open,
    changesets.num_changes AS osm_num_changes,
    changesets.comments_count,
    COALESCE(discussion_counts.available_discussion_comments, 0::bigint) AS available_discussion_comments,
    changesets.min_lon,
    changesets.min_lat,
    changesets.max_lon,
    changesets.max_lat,
    changesets.bbox,
    changesets.tags,
    changesets.source,
    changesets.replication_sequence,
    changesets.observed_at,
    changesets.ingested_at,
    changesets.updated_at,
    COALESCE(alpr_counts.alpr_nodes_created, 0::bigint) AS alpr_nodes_created,
    COALESCE(alpr_counts.alpr_nodes_modified, 0::bigint) AS alpr_nodes_modified,
    COALESCE(alpr_counts.alpr_nodes_deleted, 0::bigint) AS alpr_nodes_deleted,
    COALESCE(alpr_counts.alpr_nodes_touched, 0::bigint) AS alpr_nodes_touched
FROM osm_history.changesets AS changesets
LEFT JOIN LATERAL (
    SELECT
        count(*) FILTER (WHERE includes_version_one AND visible) AS alpr_nodes_created,
        count(*) FILTER (WHERE NOT includes_version_one AND visible) AS alpr_nodes_modified,
        count(*) FILTER (WHERE NOT visible) AS alpr_nodes_deleted,
        count(*) AS alpr_nodes_touched
    FROM (
        SELECT DISTINCT ON (versions.node_id)
            versions.node_id,
            versions.visible,
            bool_or(versions.osm_version = 1) OVER (PARTITION BY versions.node_id) AS includes_version_one
        FROM osm_history.alpr_node_versions AS versions
        WHERE versions.changeset_id = changesets.osm_changeset_id
        ORDER BY versions.node_id, versions.osm_version DESC
    ) AS final_node_versions
) AS alpr_counts ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS available_discussion_comments
    FROM osm_history.changeset_comments AS comments
    WHERE comments.changeset_id = changesets.id
) AS discussion_counts ON true;
