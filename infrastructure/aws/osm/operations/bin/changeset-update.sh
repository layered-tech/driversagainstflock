#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-changeset-bootstrap.complete"
readonly ACTIVATION_MARKER="${OSM_STATE_PATH}/global-changeset.complete"
readonly CHANGESET_STATE="${OSM_STATE_PATH}/global-changeset-replication.state"

on_error()
{
    local exit_code=$?
    trap - ERR
    put_metric ChangesetConsumerFailures 1 Count || true
    exit "${exit_code}"
}
trap on_error ERR

require_file "${BOOTSTRAP_MARKER}"
require_file "${ACTIVATION_MARKER}"
require_file "${CHANGESET_STATE}"

clean_stale_work_directories changeset-update
work_directory="$(mktemp --directory "${OSM_WORK_PATH}/changeset-update.XXXXXX")"
trap 'rm -rf -- "${work_directory}"' EXIT
pending_state="${work_directory}/global-changeset-replication.pending.state"
diff_directory="${work_directory}/diffs"
install --directory --mode=0750 "${diff_directory}"

fetch_status=0
fetch_result="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/fetch-changeset-diffs.py update \
    --server "${OSM_CHANGESET_REPLICATION_URL}" \
    --state "${CHANGESET_STATE}" \
    --pending-state "${pending_state}" \
    --output-directory "${diff_directory}" \
    --max-diffs "${CHANGESET_MAX_DIFFS_PER_RUN}")" || fetch_status=$?
if (( fetch_status == 3 )); then
    log 'No changeset replication diffs are available'
    exit 0
fi
(( fetch_status == 0 )) || die "Changeset replication download failed with status ${fetch_status}"
[[ "${fetch_result}" =~ ^diffs=([1-9][0-9]*)\ sequence=([0-9]+)$ ]] \
    || die 'Changeset replication fetcher returned invalid aggregate output'
downloaded_diff_count="${BASH_REMATCH[1]}"
fetched_terminal_sequence="${BASH_REMATCH[2]}"
require_file "${pending_state}"
terminal_sequence="$(state_sequence "${pending_state}")"
source_timestamp="$(state_timestamp "${pending_state}")"
[[ "${terminal_sequence}" == "${fetched_terminal_sequence}" && -n "${source_timestamp}" ]] \
    || die 'Changeset pending cursor does not match downloaded diffs'

database_sequence="$(psql_osm --tuples-only --no-align --command="
SELECT COALESCE((
    SELECT state_value::bigint FROM osm_pipeline.state
    WHERE state_key = 'changeset_applied_sequence'
), 0)
")"
[[ "${database_sequence}" =~ ^[0-9]+$ ]] || die 'Database changeset cursor is invalid'
if (( database_sequence >= terminal_sequence )); then
    promote_state "${pending_state}" "${CHANGESET_STATE}"
    log "Promoted already committed changeset cursor ${terminal_sequence}"
    exit 0
fi

mapfile -t diff_paths < <(find "${diff_directory}" -type f -name 'changeset-*.osm.gz' -print | sort --version-sort)
(( ${#diff_paths[@]} == downloaded_diff_count )) || die 'Downloaded changeset diff count is inconsistent'
import_arguments=()
for diff_path in "${diff_paths[@]}"; do
    import_arguments+=(--input "${diff_path}")
done
import_result="$(/opt/daf-osm/venv/bin/python \
    /opt/daf-osm/bin/import-changesets.py load \
    "${import_arguments[@]}" \
    --source minute_diff \
    --sequence "${terminal_sequence}" \
    --as-of "${source_timestamp}")"
[[ "${import_result}" =~ ^changesets=([0-9]+)\ discussion_comments=([0-9]+)\ max_id_seen=([0-9]+)$ ]] \
    || die 'Changeset importer returned invalid aggregate output'
imported_parent_count="${BASH_REMATCH[1]}"
imported_comment_count="${BASH_REMATCH[2]}"

psql_osm \
    --set=replication_sequence="${terminal_sequence}" \
    --set=source_timestamp="${source_timestamp}" \
    --file=/opt/daf-osm/database/changesets-load.sql
promote_state "${pending_state}" "${CHANGESET_STATE}"

IFS=$'\t' read -r history_count history_comment_count feed_count feed_comment_count <<< "$(
    psql_osm --tuples-only --no-align --field-separator=$'\t' --command='
SELECT
    (SELECT count(*) FROM osm_history.changesets),
    (SELECT count(*) FROM osm_history.changeset_comments),
    (SELECT count(*) FROM osm_pipeline.feed_changesets),
    (SELECT count(*) FROM osm_pipeline.feed_changeset_comments)
'
)"
put_metric ChangesetConsumerSequence "${terminal_sequence}" Count
put_metric ChangesetCount "${history_count}" Count
put_metric ChangesetDiscussionCommentCount "${history_comment_count}" Count
put_metric ChangesetFeedRetainedCount "${feed_count}" Count
put_metric ChangesetFeedDiscussionCommentCount "${feed_comment_count}" Count
log "Committed changeset sequence ${terminal_sequence}: ${imported_parent_count} parents and ${imported_comment_count} available comments observed"
