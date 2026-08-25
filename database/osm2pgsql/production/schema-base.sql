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
    last_region_check_version integer,
    last_region_checked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS osm_history.tracked_nodes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id bigint NOT NULL UNIQUE,
    first_alpr_at timestamptz,
    last_alpr_at timestamptz,
    region_confirmed_at timestamptz NOT NULL,
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

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA osm_pipeline TO osm_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA osm_current, osm_history TO osm_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA osm_pipeline, osm_current, osm_history TO osm_ingest;

GRANT SELECT ON ALL TABLES IN SCHEMA osm_current, osm_history TO osm_publisher;

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
    'Current North America OSM nodes with surveillance:type=ALPR.';
COMMENT ON TABLE osm_history.alpr_node_versions IS
    'All public OSM lifecycle versions for every tracked North America ALPR node, including contributor metadata.';
