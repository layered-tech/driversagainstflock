\set ON_ERROR_STOP on

\ir schema-base.sql

ALTER TABLE osm_current.alpr_nodes
    ALTER COLUMN osm_version SET NOT NULL,
    ALTER COLUMN osm_updated_at SET NOT NULL,
    ALTER COLUMN changeset_id SET NOT NULL,
    ALTER COLUMN osm_uid SET NOT NULL,
    ALTER COLUMN osm_user SET NOT NULL;

\ir moderation-indexes.sql

SELECT to_regclass('osm_history.application_changesets') IS NOT NULL AS has_moderation_changesets \gset
\if :has_moderation_changesets
\ir moderation-changesets.sql
\endif
