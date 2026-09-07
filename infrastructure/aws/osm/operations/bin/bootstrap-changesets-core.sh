#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

mode=bootstrap
if [[ "${1:-}" == --mode && -n "${2:-}" && -z "${3:-}" ]]; then
    mode="$2"
fi
[[ "${mode}" == bootstrap || "${mode}" == refresh ]] \
    || die 'Usage: bootstrap-changesets-core.sh --mode bootstrap|refresh'

readonly CURRENT_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-current-bootstrap.complete"
readonly HISTORY_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-history-bootstrap.complete"
readonly CHANGESET_BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-changeset-bootstrap.complete"
readonly CHANGESET_STATE="${OSM_STATE_PATH}/global-changeset-replication.state"
readonly HTTP_METADATA_PATH="${OSM_STATE_PATH}/global-changeset-${mode}-http-headers.txt"
readonly PENDING_RESULT="${OSM_STATE_PATH}/global-changeset-${mode}.pending"
readonly RETAINED_DUMP_MARKER="${OSM_STATE_PATH}/global-changeset-retained-dump.path"

require_file "${CURRENT_BOOTSTRAP_MARKER}"
require_file "${HISTORY_BOOTSTRAP_MARKER}"
if [[ "${mode}" == bootstrap && -f "${CHANGESET_BOOTSTRAP_MARKER}" ]]; then
    log 'Changeset metadata bootstrap is already complete'
    exit 0
fi

clean_stale_work_directories "global-changeset-${mode}"
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/global-changeset-${mode}.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT

if [[ ! -s "${HTTP_METADATA_PATH}" ]]; then
    record_http_metadata "${OSM_CHANGESET_DISCUSSION_URL}" "${HTTP_METADATA_PATH}"
fi
require_file "${HTTP_METADATA_PATH}"

latest_resolved_url="$(sed -n 's/^resolved_url=//p' "${HTTP_METADATA_PATH}" | tail -n 1)"
if [[ ! "${latest_resolved_url}" =~ ^https://planet\.openstreetmap\.org/planet/[0-9]{4}/discussions-[0-9]{6}\.osm\.bz2$ \
    && ! "${latest_resolved_url}" =~ ^https://osm-planet-us-west-2\.s3\.dualstack\.us-west-2\.amazonaws\.com/discussions/osm/[0-9]{4}/discussions-[0-9]{6}\.osm\.bz2$ ]]; then
    die 'Resolved discussion dump URL is not an approved immutable release'
fi

release_token="$(sed -nE 's#^.*/(discussions-([0-9]{2})[0-9]{4}\.osm\.bz2)$#\1|20\2#p' <<< "${latest_resolved_url}")"
[[ "${release_token}" == *'|'* ]] || die 'Unable to parse discussion dump release token'
release_name="${release_token%%|*}"
release_year="${release_token##*|}"
resolved_dump_url="${OSM_CHANGESET_DISCUSSION_MIRROR_BASE%/}/${release_year}/${release_name}"
[[ "${resolved_dump_url}" =~ ^https://osm-planet-us-west-2\.s3\.dualstack\.us-west-2\.amazonaws\.com/discussions/osm/[0-9]{4}/discussions-[0-9]{6}\.osm\.bz2$ ]] \
    || die 'Preferred discussion mirror URL is invalid'

dump_path="${OSM_DOWNLOAD_PATH}/${release_name}"
checksum_path="${dump_path}.md5"
if [[ ! -s "${checksum_path}" ]]; then
    download "${resolved_dump_url}.md5" "${checksum_path}"
fi
expected_md5="$(awk 'NR == 1 { print tolower($1) }' "${checksum_path}")"
[[ "${expected_md5}" =~ ^[0-9a-f]{32}$ ]] || die 'Discussion dump MD5 sidecar is invalid'

if [[ ! -s "${dump_path}" ]]; then
    available_bytes="$(df --block-size=1 --output=avail "${OSM_DOWNLOAD_PATH}" | tail -n 1 | tr -d ' ')"
    content_length="$(awk 'BEGIN { IGNORECASE=1 } /^content-length:/ { gsub("\\r", "", $2); value=$2 } END { print value }' "${HTTP_METADATA_PATH}")"
    [[ "${available_bytes}" =~ ^[0-9]+$ ]] || die 'Unable to determine available dump volume bytes'
    if [[ "${content_length}" =~ ^[1-9][0-9]*$ ]]; then
        (( available_bytes > content_length )) || die 'Insufficient free space for discussion dump'
    fi
    download "${resolved_dump_url}" "${dump_path}"
fi
printf '%s  %s\n' "${expected_md5}" "${dump_path}" | md5sum --check --status - \
    || die 'Discussion dump checksum verification failed'

dump_size="$(stat --format=%s "${dump_path}")"
[[ "${dump_size}" =~ ^[1-9][0-9]*$ ]] || die 'Discussion dump size is invalid'
dump_timestamp="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/import-changesets.py header \
    --input "${dump_path}")"
[[ "${dump_timestamp}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]] \
    || die 'Discussion dump XML timestamp is invalid'
if [[ "${mode}" == refresh ]]; then
    previous_dump_timestamp="$(psql_osm --tuples-only --no-align --command="SELECT state_value FROM osm_pipeline.state WHERE state_key = 'changeset_dump_timestamp'")"
    is_newer="$(psql_osm --tuples-only --no-align \
        --set=previous_dump_timestamp="${previous_dump_timestamp}" \
        --set=dump_timestamp="${dump_timestamp}" \
        <<'NEWER_DUMP_SQL'
SELECT (:'dump_timestamp'::timestamptz > :'previous_dump_timestamp'::timestamptz)::integer;
NEWER_DUMP_SQL
)"
    [[ "${is_newer}" == 1 ]] || die 'New discussion dump is not newer than the retained release'
fi

tracked_ids="${work_directory}/tracked-changeset-ids.txt"
psql_osm --tuples-only --no-align --command="
SELECT changeset_id
FROM osm_history.alpr_node_versions
WHERE changeset_id IS NOT NULL
UNION
SELECT changeset_id
FROM osm_current.alpr_nodes
WHERE changeset_id IS NOT NULL
ORDER BY 1
" > "${tracked_ids}"
require_file "${tracked_ids}"

import_result="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/import-changesets.py load \
    --input "${dump_path}" \
    --source discussion_dump \
    --as-of "${dump_timestamp}" \
    --only-ids "${tracked_ids}")"
[[ "${import_result}" =~ ^changesets=([0-9]+)\ discussion_comments=([0-9]+)\ max_id_seen=([0-9]+)$ ]] \
    || die 'Discussion dump importer returned invalid aggregate output'
imported_changesets="${BASH_REMATCH[1]}"
imported_comments="${BASH_REMATCH[2]}"
dump_max_id="${BASH_REMATCH[3]}"
(( imported_changesets > 0 && dump_max_id > 0 )) \
    || die 'Discussion dump produced no tracked changesets'

psql_osm --file=/opt/daf-osm/database/changesets-bootstrap-load.sql

missing_count="$(psql_osm --tuples-only --no-align \
    --set=dump_timestamp="${dump_timestamp}" \
    <<'MISSING_DUMP_SQL'
WITH required AS (
    SELECT changeset_id AS osm_changeset_id
    FROM osm_history.alpr_node_versions
    WHERE changeset_id IS NOT NULL
      AND osm_updated_at <= :'dump_timestamp'::timestamptz
    UNION
    SELECT changeset_id AS osm_changeset_id
    FROM osm_current.alpr_nodes
    WHERE changeset_id IS NOT NULL
      AND osm_updated_at <= :'dump_timestamp'::timestamptz
)
SELECT count(*)
FROM required
WHERE NOT EXISTS (
    SELECT 1 FROM osm_history.changesets
    WHERE changesets.osm_changeset_id = required.osm_changeset_id
);
MISSING_DUMP_SQL
)"
[[ "${missing_count}" == 0 ]] || die "Tracked changesets missing after dump load: ${missing_count}"

replay_start="$(date --utc --date="${dump_timestamp} -24 hours" +%Y-%m-%dT%H:%M:%SZ)"
pending_state="${work_directory}/global-changeset-replication.pending.state"
/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/fetch-changeset-diffs.py initialize \
    --server "${OSM_CHANGESET_REPLICATION_URL}" \
    --start-timestamp "${replay_start}" \
    --pending-state "${pending_state}" >/dev/null
require_file "${pending_state}"
replay_sequence="$(state_sequence "${pending_state}")"
replay_timestamp="$(state_timestamp "${pending_state}")"
[[ "${replay_sequence}" =~ ^[0-9]+$ && -n "${replay_timestamp}" ]] \
    || die 'Discussion dump replay cursor is invalid'

result_partial="${PENDING_RESULT}.partial"
printf 'dump_path=%s\nchecksum_path=%s\ndump_url=%s\ndump_md5=%s\ndump_size=%s\ndump_timestamp=%s\ndump_max_id=%s\nreplay_sequence=%s\nreplay_timestamp=%s\nimported_changesets=%s\nimported_comments=%s\n' \
    "${dump_path}" \
    "${checksum_path}" \
    "${resolved_dump_url}" \
    "${expected_md5}" \
    "${dump_size}" \
    "${dump_timestamp}" \
    "${dump_max_id}" \
    "${replay_sequence}" \
    "${replay_timestamp}" \
    "${imported_changesets}" \
    "${imported_comments}" \
    > "${result_partial}"
chmod 0640 "${result_partial}"
mv --force "${result_partial}" "${PENDING_RESULT}"

if [[ "${mode}" == bootstrap ]]; then
    psql_osm \
        --set=applied_sequence="${replay_sequence}" \
        --set=source_timestamp="${replay_timestamp}" \
        --set=dump_md5="${expected_md5}" \
        --set=dump_url="${resolved_dump_url}" \
        --set=dump_timestamp="${dump_timestamp}" \
        --set=dump_max_id="${dump_max_id}" \
        --set=replay_sequence="${replay_sequence}" <<'BOOTSTRAP_STATE_SQL'
BEGIN;
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('changeset_applied_sequence', :'applied_sequence'),
    ('changeset_source_timestamp', :'source_timestamp'),
    ('changeset_dump_md5', :'dump_md5'),
    ('changeset_dump_resolved_url', :'dump_url'),
    ('changeset_dump_timestamp', :'dump_timestamp'),
    ('changeset_dump_max_id', :'dump_max_id'),
    ('changeset_dump_replay_sequence', :'replay_sequence'),
    ('changeset_bootstrap_complete', '1')
ON CONFLICT (state_key) DO UPDATE SET
    state_value = EXCLUDED.state_value,
    updated_at = clock_timestamp();
COMMIT;
BOOTSTRAP_STATE_SQL
    promote_state "${pending_state}" "${CHANGESET_STATE}"
    marker_partial="${RETAINED_DUMP_MARKER}.partial"
    printf '%s\n' "${dump_path}" > "${marker_partial}"
    chmod 0640 "${marker_partial}"
    mv --force "${marker_partial}" "${RETAINED_DUMP_MARKER}"
fi

put_metric ChangesetCount "$(psql_osm --tuples-only --no-align --command='SELECT count(*) FROM osm_history.changesets')" Count
put_metric ChangesetDiscussionCommentCount "$(psql_osm --tuples-only --no-align --command='SELECT count(*) FROM osm_history.changeset_comments')" Count
log "Changeset ${mode} loaded ${imported_changesets} tracked parents and ${imported_comments} available comments at dump timestamp ${dump_timestamp}"
