\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS postgis;

SET ROLE osm_owner;

REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE :"database_name" FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS osm_ingest AUTHORIZATION osm_owner;
CREATE SCHEMA IF NOT EXISTS osm_pipeline AUTHORIZATION osm_owner;
CREATE SCHEMA IF NOT EXISTS osm_current AUTHORIZATION osm_owner;
CREATE SCHEMA IF NOT EXISTS osm_history AUTHORIZATION osm_owner;

GRANT CONNECT, TEMPORARY ON DATABASE :"database_name" TO osm_ingest;
GRANT CONNECT ON DATABASE :"database_name" TO osm_publisher;
GRANT USAGE ON SCHEMA public TO osm_ingest, osm_publisher;
GRANT USAGE, CREATE ON SCHEMA osm_ingest TO osm_ingest;
GRANT USAGE ON SCHEMA osm_pipeline, osm_current, osm_history TO osm_ingest;
GRANT USAGE ON SCHEMA osm_current, osm_history TO osm_publisher;

CREATE TABLE IF NOT EXISTS osm_pipeline.state (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    state_key text NOT NULL UNIQUE,
    state_value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS osm_pipeline.replication_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stream text NOT NULL CHECK (stream IN ('current', 'history', 'backup', 'publication')),
    sequence_number bigint,
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_at timestamptz,
    status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    detail text
);

CREATE TABLE IF NOT EXISTS osm_pipeline.global_alpr_node_ids (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL UNIQUE,
    first_seen_version integer,
    last_seen_version integer,
    first_seen_at timestamptz,
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS osm_history.tracked_nodes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL UNIQUE,
    first_alpr_at timestamptz,
    last_alpr_at timestamptz,
    qualified_at timestamptz NOT NULL,
    api_backfilled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS osm_history.alpr_node_versions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL,
    osm_version integer NOT NULL,
    visible boolean NOT NULL,
    longitude double precision,
    latitude double precision,
    geom geometry(Point, 4326),
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_alpr boolean GENERATED ALWAYS AS ((tags ->> 'surveillance:type') = 'ALPR') STORED,
    osm_updated_at timestamptz NOT NULL,
    changeset_id bigint NOT NULL,
    osm_uid bigint,
    osm_user text,
    source text NOT NULL CHECK (source IN ('full_history', 'minute_diff', 'api_backfill')),
    replication_sequence bigint,
    ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT alpr_node_versions_node_version_unique UNIQUE (node_id, osm_version),
    CONSTRAINT alpr_node_versions_coordinates_pair CHECK (
        (longitude IS NULL AND latitude IS NULL)
        OR (longitude IS NOT NULL AND latitude IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS alpr_node_versions_node_updated_index
    ON osm_history.alpr_node_versions (node_id, osm_updated_at);
CREATE INDEX IF NOT EXISTS alpr_node_versions_alpr_updated_index
    ON osm_history.alpr_node_versions (osm_updated_at)
    WHERE is_alpr;
CREATE INDEX IF NOT EXISTS alpr_node_versions_geom_index
    ON osm_history.alpr_node_versions USING gist (geom)
    WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS alpr_node_versions_changeset_index
    ON osm_history.alpr_node_versions (changeset_id);

CREATE UNLOGGED TABLE IF NOT EXISTS osm_pipeline.node_versions_stage (
    node_id bigint NOT NULL,
    osm_version integer NOT NULL,
    visible boolean NOT NULL,
    longitude double precision,
    latitude double precision,
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    osm_updated_at timestamptz NOT NULL,
    changeset_id bigint NOT NULL,
    osm_uid bigint,
    osm_user text,
    source text NOT NULL,
    replication_sequence bigint
);

CREATE INDEX IF NOT EXISTS node_versions_stage_node_version_index
    ON osm_pipeline.node_versions_stage (node_id, osm_version);
CREATE INDEX IF NOT EXISTS node_versions_stage_exact_alpr_index
    ON osm_pipeline.node_versions_stage (node_id)
    WHERE (tags ->> 'surveillance:type') = 'ALPR';

CREATE TABLE IF NOT EXISTS osm_current.alpr_nodes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL UNIQUE,
    longitude double precision NOT NULL,
    latitude double precision NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    tags jsonb NOT NULL,
    surveillance text,
    surveillance_type text NOT NULL,
    direction text,
    camera_direction text,
    osm_version integer,
    osm_updated_at timestamptz,
    changeset_id bigint,
    osm_uid bigint,
    osm_user text,
    source_replication_sequence bigint,
    source_timestamp timestamptz,
    published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT alpr_nodes_exact_tag CHECK (surveillance_type = 'ALPR')
);

CREATE INDEX IF NOT EXISTS alpr_nodes_geom_index
    ON osm_current.alpr_nodes USING gist (geom);
CREATE INDEX IF NOT EXISTS alpr_nodes_updated_index
    ON osm_current.alpr_nodes (osm_updated_at);
CREATE INDEX IF NOT EXISTS alpr_nodes_changeset_index
    ON osm_current.alpr_nodes (changeset_id);

CREATE TABLE IF NOT EXISTS osm_history.changesets (
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
    bbox geometry(Geometry, 4326),
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL CHECK (source IN ('discussion_dump', 'minute_diff')),
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT changesets_external_id_nonnegative CHECK (osm_changeset_id >= 0),
    CONSTRAINT changesets_counts_nonnegative CHECK (
        (num_changes IS NULL OR num_changes >= 0)
        AND (comments_count IS NULL OR comments_count >= 0)
    ),
    CONSTRAINT changesets_tags_object CHECK (jsonb_typeof(tags) = 'object'),
    CONSTRAINT changesets_open_closed CHECK (
        (open AND closed_at IS NULL)
        OR (NOT open AND closed_at IS NOT NULL)
    ),
    CONSTRAINT changesets_bbox_coordinates CHECK (
        (
            min_lon IS NULL
            AND min_lat IS NULL
            AND max_lon IS NULL
            AND max_lat IS NULL
            AND bbox IS NULL
        )
        OR (
            min_lon BETWEEN -180 AND 180
            AND max_lon BETWEEN -180 AND 180
            AND min_lat BETWEEN -90 AND 90
            AND max_lat BETWEEN -90 AND 90
            AND min_lon <= max_lon
            AND min_lat <= max_lat
            AND bbox IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS changesets_osm_uid_index
    ON osm_history.changesets (osm_uid);
CREATE INDEX IF NOT EXISTS changesets_closed_at_index
    ON osm_history.changesets (closed_at);
CREATE INDEX IF NOT EXISTS changesets_observed_at_index
    ON osm_history.changesets (observed_at);
CREATE INDEX IF NOT EXISTS changesets_stale_open_index
    ON osm_history.changesets (created_at)
    WHERE open;

CREATE TABLE IF NOT EXISTS osm_history.changeset_comments (
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
    CONSTRAINT changeset_comments_external_id_nonnegative CHECK (osm_comment_id >= 0),
    CONSTRAINT changeset_comments_ordinal_nonnegative CHECK (ordinal >= 0),
    CONSTRAINT changeset_comments_parent_comment_unique UNIQUE (changeset_id, osm_comment_id),
    CONSTRAINT changeset_comments_parent_ordinal_unique UNIQUE (changeset_id, ordinal)
);

ALTER TABLE osm_history.changeset_comments
    ALTER COLUMN osm_comment_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS changeset_comments_parent_ordinal_index
    ON osm_history.changeset_comments (changeset_id, ordinal);
CREATE INDEX IF NOT EXISTS changeset_comments_osm_uid_index
    ON osm_history.changeset_comments (osm_uid);
CREATE INDEX IF NOT EXISTS changeset_comments_commented_at_index
    ON osm_history.changeset_comments (commented_at);

CREATE TABLE IF NOT EXISTS osm_pipeline.feed_changesets (
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
    bbox geometry(Geometry, 4326),
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL CHECK (source IN ('discussion_dump', 'minute_diff')),
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT feed_changesets_external_id_nonnegative CHECK (osm_changeset_id >= 0),
    CONSTRAINT feed_changesets_counts_nonnegative CHECK (
        (num_changes IS NULL OR num_changes >= 0)
        AND (comments_count IS NULL OR comments_count >= 0)
    ),
    CONSTRAINT feed_changesets_tags_object CHECK (jsonb_typeof(tags) = 'object'),
    CONSTRAINT feed_changesets_open_closed CHECK (
        (open AND closed_at IS NULL)
        OR (NOT open AND closed_at IS NOT NULL)
    ),
    CONSTRAINT feed_changesets_bbox_coordinates CHECK (
        (
            min_lon IS NULL
            AND min_lat IS NULL
            AND max_lon IS NULL
            AND max_lat IS NULL
            AND bbox IS NULL
        )
        OR (
            min_lon BETWEEN -180 AND 180
            AND max_lon BETWEEN -180 AND 180
            AND min_lat BETWEEN -90 AND 90
            AND max_lat BETWEEN -90 AND 90
            AND min_lon <= max_lon
            AND min_lat <= max_lat
            AND bbox IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS feed_changesets_observed_at_index
    ON osm_pipeline.feed_changesets (observed_at);

CREATE TABLE IF NOT EXISTS osm_pipeline.feed_changeset_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changeset_id bigint NOT NULL REFERENCES osm_pipeline.feed_changesets (id) ON DELETE CASCADE,
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
    CONSTRAINT feed_changeset_comments_external_id_nonnegative CHECK (osm_comment_id >= 0),
    CONSTRAINT feed_changeset_comments_ordinal_nonnegative CHECK (ordinal >= 0),
    CONSTRAINT feed_changeset_comments_parent_comment_unique UNIQUE (changeset_id, osm_comment_id),
    CONSTRAINT feed_changeset_comments_parent_ordinal_unique UNIQUE (changeset_id, ordinal)
);

ALTER TABLE osm_pipeline.feed_changeset_comments
    ALTER COLUMN osm_comment_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS feed_changeset_comments_parent_ordinal_index
    ON osm_pipeline.feed_changeset_comments (changeset_id, ordinal);
CREATE INDEX IF NOT EXISTS feed_changeset_comments_osm_uid_index
    ON osm_pipeline.feed_changeset_comments (osm_uid);
CREATE INDEX IF NOT EXISTS feed_changeset_comments_commented_at_index
    ON osm_pipeline.feed_changeset_comments (commented_at);

CREATE UNLOGGED TABLE IF NOT EXISTS osm_pipeline.changesets_stage (
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
    bbox geometry(Geometry, 4326),
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL,
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    discussion jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT changesets_stage_discussion_array CHECK (jsonb_typeof(discussion) = 'array')
);

CREATE UNLOGGED TABLE IF NOT EXISTS osm_pipeline.changesets_dump_stage (
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
    bbox geometry(Geometry, 4326),
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL,
    replication_sequence bigint,
    observed_at timestamptz NOT NULL,
    discussion jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT changesets_dump_stage_discussion_array CHECK (jsonb_typeof(discussion) = 'array')
);

CREATE OR REPLACE VIEW osm_current.application_alpr_nodes AS
SELECT
    id,
    node_id AS osm_id,
    latitude,
    longitude,
    geom AS location,
    tags,
    surveillance_type,
    direction,
    camera_direction,
    osm_updated_at,
    osm_version,
    changeset_id AS osm_changeset_id,
    osm_user,
    osm_uid,
    source_replication_sequence,
    source_timestamp,
    published_at AS last_synced_at,
    published_at AS created_at,
    published_at AS updated_at
FROM osm_current.alpr_nodes;

CREATE OR REPLACE VIEW osm_history.application_changesets AS
WITH final_node_versions AS (
    SELECT DISTINCT ON (versions.changeset_id, versions.node_id)
        versions.changeset_id,
        versions.node_id,
        versions.visible,
        versions.osm_version,
        bool_or(versions.osm_version = 1) OVER (
            PARTITION BY versions.changeset_id, versions.node_id
        ) AS includes_version_one
    FROM osm_history.alpr_node_versions AS versions
    ORDER BY versions.changeset_id, versions.node_id, versions.osm_version DESC
), alpr_counts AS (
    SELECT
        changeset_id,
        count(*) FILTER (WHERE includes_version_one AND visible) AS alpr_nodes_created,
        count(*) FILTER (WHERE NOT includes_version_one AND visible) AS alpr_nodes_modified,
        count(*) FILTER (WHERE NOT visible) AS alpr_nodes_deleted,
        count(*) AS alpr_nodes_touched
    FROM final_node_versions
    GROUP BY changeset_id
), discussion_counts AS (
    SELECT changeset_id, count(*) AS available_discussion_comments
    FROM osm_history.changeset_comments
    GROUP BY changeset_id
)
SELECT
    changesets.osm_changeset_id,
    changesets.osm_uid,
    changesets.osm_user,
    changesets.created_at,
    changesets.closed_at,
    changesets.open,
    changesets.num_changes AS osm_num_changes,
    changesets.comments_count,
    COALESCE(discussion_counts.available_discussion_comments, 0) AS available_discussion_comments,
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
    COALESCE(alpr_counts.alpr_nodes_created, 0) AS alpr_nodes_created,
    COALESCE(alpr_counts.alpr_nodes_modified, 0) AS alpr_nodes_modified,
    COALESCE(alpr_counts.alpr_nodes_deleted, 0) AS alpr_nodes_deleted,
    COALESCE(alpr_counts.alpr_nodes_touched, 0) AS alpr_nodes_touched
FROM osm_history.changesets AS changesets
LEFT JOIN alpr_counts
    ON alpr_counts.changeset_id = changesets.osm_changeset_id
LEFT JOIN discussion_counts
    ON discussion_counts.changeset_id = changesets.id;

CREATE OR REPLACE VIEW osm_history.application_changeset_comments AS
SELECT
    changesets.osm_changeset_id,
    comments.osm_comment_id,
    comments.ordinal,
    comments.commented_at,
    comments.osm_uid,
    comments.osm_user,
    comments.visible,
    comments.body,
    comments.replication_sequence,
    comments.observed_at,
    comments.ingested_at,
    comments.updated_at
FROM osm_history.changeset_comments AS comments
INNER JOIN osm_history.changesets AS changesets
    ON changesets.id = comments.changeset_id;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA osm_pipeline TO osm_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA osm_current, osm_history TO osm_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA osm_pipeline, osm_current, osm_history TO osm_ingest;

GRANT SELECT ON ALL TABLES IN SCHEMA osm_current, osm_history TO osm_publisher;
GRANT SELECT ON osm_current.application_alpr_nodes TO osm_publisher;
GRANT SELECT ON osm_history.application_changesets, osm_history.application_changeset_comments TO osm_publisher;

ALTER DEFAULT PRIVILEGES FOR ROLE osm_owner IN SCHEMA osm_pipeline
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO osm_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE osm_owner IN SCHEMA osm_current
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO osm_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE osm_owner IN SCHEMA osm_history
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO osm_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE osm_owner IN SCHEMA osm_current
    GRANT SELECT ON TABLES TO osm_publisher;
ALTER DEFAULT PRIVILEGES FOR ROLE osm_owner IN SCHEMA osm_history
    GRANT SELECT ON TABLES TO osm_publisher;
ALTER DEFAULT PRIVILEGES FOR ROLE osm_owner IN SCHEMA osm_pipeline, osm_current, osm_history
    GRANT USAGE, SELECT ON SEQUENCES TO osm_ingest;

DO $ownership_contract$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname IN ('osm_pipeline', 'osm_current', 'osm_history')
          AND tableowner <> 'osm_owner'
    ) THEN
        RAISE EXCEPTION 'Production OSM tables must be owned by osm_owner';
    END IF;
END
$ownership_contract$;

COMMENT ON TABLE osm_current.alpr_nodes IS
    'Current global OSM nodes with surveillance:type=ALPR.';
COMMENT ON VIEW osm_current.application_alpr_nodes IS
    'Read-only compatibility projection for the Drivers Against Flock application.';
COMMENT ON TABLE osm_history.alpr_node_versions IS
    'All public OSM lifecycle versions for every globally qualified ALPR node, including contributor metadata.';
COMMENT ON TABLE osm_history.changesets IS
    'OSM changeset metadata for tracked ALPR node lifecycles.';
COMMENT ON TABLE osm_history.changeset_comments IS
    'Latest available complete OSM discussion snapshots for published changesets.';
COMMENT ON VIEW osm_history.application_changesets IS
    'Published changeset metadata with ALPR-specific lifecycle counts.';
COMMENT ON VIEW osm_history.application_changeset_comments IS
    'Published OSM changeset discussion comments.';
