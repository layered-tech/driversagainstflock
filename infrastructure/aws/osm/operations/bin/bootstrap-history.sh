#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-history-bootstrap.complete"

if [[ ! -f "${BOOTSTRAP_MARKER}" ]]; then
    psql_osm --command='TRUNCATE osm_pipeline.global_alpr_node_ids, osm_pipeline.node_versions_stage'
fi

exec /opt/daf-osm/bin/bootstrap-history-wrapper.sh "$@"
