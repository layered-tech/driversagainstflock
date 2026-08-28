#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

assert_zero()
{
    local label="$1"
    local value="$2"

    [[ "${value}" =~ ^[0-9]+$ ]] || die "${label} returned a non-numeric value: ${value}"
    (( value == 0 )) || die "${label}: expected 0, found ${value}"
}

assert_positive()
{
    local label="$1"
    local value="$2"

    [[ "${value}" =~ ^[0-9]+$ ]] || die "${label} returned a non-numeric value: ${value}"
    (( value > 0 )) || die "${label}: expected a positive count, found ${value}"
}

require_file "${OSM_STATE_PATH}/global-stack.complete"
require_file "${OSM_STATE_PATH}/global-current-bootstrap.complete"
require_file "${OSM_STATE_PATH}/global-history-bootstrap.complete"
require_file "${OSM_STATE_PATH}/global-replication.state"
require_file "${OSM_STATE_PATH}/global-current-replication.state"
require_file "${OSM_STATE_PATH}/global-history-replication.state"

current_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_current.alpr_nodes')"
history_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_history.alpr_node_versions')"
assert_positive 'Published current ALPR nodes' "${current_count}"
assert_positive 'ALPR lifecycle history versions' "${history_count}"

stage_relation="$(psql_osm --tuples-only --no-align \
    --command="SELECT to_regclass('osm_ingest.alpr_nodes_stage')")"
[[ -n "${stage_relation}" ]] || die 'osm2pgsql current staging table does not exist'
stage_count="$(psql_osm --tuples-only --no-align \
    --command='SELECT count(*) FROM osm_ingest.alpr_nodes_stage')"
[[ "${stage_count}" == "${current_count}" ]] \
    || die "Publication parity mismatch: staging ${stage_count}, current ${current_count}"

contract_errors="$(psql_osm --tuples-only --no-align --command="
SELECT
    (SELECT count(*) FROM osm_current.alpr_nodes WHERE surveillance_type <> 'ALPR')
  + (SELECT count(*) FROM osm_current.alpr_nodes WHERE tags ->> 'surveillance:type' IS DISTINCT FROM 'ALPR')
  + (SELECT count(*) FROM osm_current.alpr_nodes WHERE ST_SRID(geom) <> 4326 OR GeometryType(geom) <> 'POINT')
  + (SELECT count(*) FROM osm_history.alpr_node_versions WHERE osm_version < 1 OR changeset_id < 1)
  + (SELECT count(*) FROM osm_history.alpr_node_versions WHERE visible AND (longitude IS NULL OR latitude IS NULL OR geom IS NULL))
  + (SELECT count(*) FROM osm_history.alpr_node_versions WHERE geom IS NOT NULL AND (ST_SRID(geom) <> 4326 OR GeometryType(geom) <> 'POINT'))
  + (SELECT count(*) FROM osm_history.tracked_nodes AS tracked WHERE NOT EXISTS (SELECT 1 FROM osm_history.alpr_node_versions AS versions WHERE versions.node_id = tracked.node_id AND versions.tags ->> 'surveillance:type' = 'ALPR'))
  + (SELECT count(*) FROM osm_pipeline.global_alpr_node_ids AS candidates LEFT JOIN osm_history.tracked_nodes AS tracked ON tracked.node_id = candidates.node_id WHERE tracked.node_id IS NULL)
  + (SELECT count(*) FROM osm_history.alpr_node_versions WHERE jsonb_typeof(tags) <> 'object')
")"
assert_zero 'Current/history data contract violations' "${contract_errors}"

production_owner_errors="$(psql_osm --tuples-only --no-align --command="
SELECT count(*)
FROM pg_tables
WHERE schemaname IN ('osm_pipeline', 'osm_current', 'osm_history')
  AND tableowner <> 'osm_owner'
")"
assert_zero 'Production tables not owned by osm_owner' "${production_owner_errors}"

application_view_errors="$(psql_osm --tuples-only --no-align --command="
SELECT
    CASE WHEN to_regclass('osm_current.application_alpr_nodes') IS NULL THEN 1 ELSE 0 END
  + CASE WHEN (SELECT count(*) FROM osm_current.application_alpr_nodes) = (SELECT count(*) FROM osm_current.alpr_nodes) THEN 0 ELSE 1 END
  + CASE WHEN (SELECT viewowner FROM pg_views WHERE schemaname = 'osm_current' AND viewname = 'application_alpr_nodes') = 'osm_owner' THEN 0 ELSE 1 END
")"
assert_zero 'Application reader view contract violations' "${application_view_errors}"

public_connect_grants="$(psql_osm --tuples-only --no-align --command="
SELECT count(*)
FROM pg_database AS databases
CROSS JOIN LATERAL aclexplode(COALESCE(databases.datacl, acldefault('d', databases.datdba))) AS privileges
WHERE databases.datname = current_database()
  AND privileges.grantee = 0
  AND privileges.privilege_type IN ('CONNECT', 'CREATE', 'TEMPORARY')
")"
assert_zero 'PUBLIC database privileges' "${public_connect_grants}"

database_role_privilege_errors="$(psql_osm --tuples-only --no-align --command="
SELECT
    CASE WHEN has_database_privilege('osm_ingest', current_database(), 'CONNECT') THEN 0 ELSE 1 END
  + CASE WHEN has_database_privilege('osm_ingest', current_database(), 'TEMPORARY') THEN 0 ELSE 1 END
  + CASE WHEN has_database_privilege('osm_publisher', current_database(), 'CONNECT') THEN 0 ELSE 1 END
  + CASE WHEN has_database_privilege('osm_publisher', current_database(), 'TEMPORARY') THEN 1 ELSE 0 END
  + CASE WHEN has_database_privilege('osm_publisher', current_database(), 'CREATE') THEN 1 ELSE 0 END
")"
assert_zero 'Database role privilege contract violations' "${database_role_privilege_errors}"

publisher_privilege_errors="$(psql_osm --tuples-only --no-align --command="
SELECT
    CASE WHEN has_table_privilege('osm_publisher', 'osm_current.alpr_nodes', 'SELECT') THEN 0 ELSE 1 END
  + CASE WHEN has_table_privilege('osm_publisher', 'osm_current.application_alpr_nodes', 'SELECT') THEN 0 ELSE 1 END
  + CASE WHEN has_table_privilege('osm_publisher', 'osm_history.alpr_node_versions', 'SELECT') THEN 0 ELSE 1 END
  + CASE WHEN has_table_privilege('osm_publisher', 'osm_current.alpr_nodes', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN 1 ELSE 0 END
  + CASE WHEN has_table_privilege('osm_publisher', 'osm_current.application_alpr_nodes', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN 1 ELSE 0 END
  + CASE WHEN has_table_privilege('osm_publisher', 'osm_history.alpr_node_versions', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN 1 ELSE 0 END
")"
assert_zero 'Publisher least-privilege contract violations' "${publisher_privilege_errors}"

while IFS= read -r non_node_table; do
    [[ -n "${non_node_table}" ]] || continue
    non_node_count="$(psql_osm --tuples-only --no-align \
        --command="SELECT count(*) FROM ${non_node_table}")"
    assert_zero "Persisted non-node objects in ${non_node_table}" "${non_node_count}"
done < <(psql_osm --tuples-only --no-align --command="
SELECT format('%I.%I', schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'osm_ingest'
  AND (tablename LIKE '%way%' OR tablename LIKE '%rel%')
")

road_tables="$(psql_osm --tuples-only --no-align --command="
SELECT count(*)
FROM pg_tables
WHERE schemaname IN ('osm_ingest', 'osm_pipeline', 'osm_current', 'osm_history')
  AND (tablename LIKE '%road%' OR tablename LIKE '%segment%')
")"
assert_zero 'Road or segment output tables' "${road_tables}"

database_shared_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'shared_feed_sequence'")"
database_current_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'")"
database_history_sequence="$(psql_osm --tuples-only --no-align \
    --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'")"
file_shared_sequence="$(state_sequence "${OSM_STATE_PATH}/global-replication.state")"
file_current_sequence="$(state_sequence "${OSM_STATE_PATH}/global-current-replication.state")"
file_history_sequence="$(state_sequence "${OSM_STATE_PATH}/global-history-replication.state")"
[[ "${database_shared_sequence}" == "${file_shared_sequence}" ]] \
    || die 'Shared feed database/file cursors differ'
[[ "${database_current_sequence}" == "${file_current_sequence}" ]] \
    || die 'Current replication database/file cursors differ'
[[ "${database_history_sequence}" == "${file_history_sequence}" ]] \
    || die 'History replication database/file cursors differ'
[[ "${database_shared_sequence}" == "${database_current_sequence}" \
    && "${database_shared_sequence}" == "${database_history_sequence}" ]] \
    || die 'Shared, current, and history cursors have not converged'

log "Global validation complete: ${current_count} current nodes, ${history_count} public lifecycle versions at sequence ${database_shared_sequence}"
