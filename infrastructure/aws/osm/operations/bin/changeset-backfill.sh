#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-changeset-bootstrap.complete"
readonly ACTIVATION_MARKER="${OSM_STATE_PATH}/global-changeset.complete"
readonly RETAINED_DUMP_MARKER="${OSM_STATE_PATH}/global-changeset-retained-dump.path"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric ChangesetBackfillFailures 1 Count || true
    exit "${exit_code}"
}
trap on_error ERR

require_file "${BOOTSTRAP_MARKER}"
require_file "${ACTIVATION_MARKER}"
require_file "${RETAINED_DUMP_MARKER}"
dump_path="$(< "${RETAINED_DUMP_MARKER}")"
require_file "${dump_path}"
require_file "${dump_path}.md5"

dump_timestamp="$(psql_osm --tuples-only --no-align --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_dump_timestamp'")"
dump_max_id="$(psql_osm --tuples-only --no-align --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_dump_max_id'")"
[[ -n "${dump_timestamp}" && "${dump_max_id}" =~ ^[0-9]+$ ]] || die 'Retained discussion dump state is invalid'

clean_stale_work_directories changeset-backfill
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/changeset-backfill.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT
missing_ids="${work_directory}/missing-changeset-ids.txt"
psql_osm --tuples-only --no-align --set=dump_max_id="${dump_max_id}" > "${missing_ids}" <<'MISSING_BACKFILL_SQL'
WITH tracked AS (
    SELECT changeset_id AS osm_changeset_id FROM osm_history.alpr_node_versions WHERE changeset_id IS NOT NULL
    UNION
    SELECT changeset_id AS osm_changeset_id FROM osm_current.alpr_nodes WHERE changeset_id IS NOT NULL
)
SELECT osm_changeset_id
FROM tracked
WHERE osm_changeset_id <= :'dump_max_id'::bigint
  AND NOT EXISTS (
      SELECT 1 FROM osm_history.changesets
      WHERE changesets.osm_changeset_id = tracked.osm_changeset_id
  )
ORDER BY osm_changeset_id;
MISSING_BACKFILL_SQL
if [[ ! -s "${missing_ids}" ]]; then
    log 'No tracked changesets require discussion-dump backfill'
    exit 0
fi

largest_missing_id="$(tail -n 1 "${missing_ids}")"
[[ "${largest_missing_id}" =~ ^[0-9]+$ ]] || die 'Missing changeset ID export is invalid'
/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/import-changesets.py load \
    --input "${dump_path}" \
    --source discussion_dump \
    --as-of "${dump_timestamp}" \
    --only-ids "${missing_ids}" \
    --stop-after-id "${largest_missing_id}" >/dev/null
psql_osm --file=/opt/daf-osm/database/changesets-bootstrap-load.sql

remaining="$(psql_osm --tuples-only --no-align --command="
SELECT count(*)
FROM unnest(ARRAY[$(paste -sd, "${missing_ids}")]::bigint[]) AS requested(osm_changeset_id)
WHERE NOT EXISTS (
    SELECT 1 FROM osm_history.changesets
    WHERE changesets.osm_changeset_id = requested.osm_changeset_id
)
")"
[[ "${remaining}" == 0 ]] || die "Changeset backfill left ${remaining} requested parents missing"
log "Backfilled $(wc -l < "${missing_ids}" | tr -d ' ') tracked changesets from the retained discussion dump"
