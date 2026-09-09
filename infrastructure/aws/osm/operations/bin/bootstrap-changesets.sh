#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-changeset-bootstrap.complete"
readonly CHANGESET_STATE="${OSM_STATE_PATH}/global-changeset-replication.state"

/opt/daf-osm/bin/bootstrap-changesets-core.sh --mode bootstrap
require_file "${CHANGESET_STATE}"

marker_partial="${BOOTSTRAP_MARKER}.partial"
printf 'sequence=%s\ncompleted_at=%s\n' \
    "$(state_sequence "${CHANGESET_STATE}")" \
    "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" \
    > "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${BOOTSTRAP_MARKER}"
