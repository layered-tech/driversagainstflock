\set ON_ERROR_STOP on

CREATE INDEX CONCURRENTLY IF NOT EXISTS alpr_node_versions_latest_index
    ON osm_history.alpr_node_versions (node_id ASC, osm_version DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS alpr_node_versions_changeset_latest_index
    ON osm_history.alpr_node_versions (changeset_id, node_id, osm_version DESC)
    INCLUDE (visible);

SELECT to_regclass('osm_history.changesets') IS NOT NULL AS has_changesets \gset
\if :has_changesets
CREATE INDEX CONCURRENTLY IF NOT EXISTS changesets_created_id_index
    ON osm_history.changesets (created_at DESC, osm_changeset_id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS changesets_uid_created_id_index
    ON osm_history.changesets (osm_uid, created_at DESC, osm_changeset_id DESC);
\endif
