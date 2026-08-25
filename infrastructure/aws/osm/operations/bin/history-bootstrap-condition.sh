#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

if [[ ! -s "${OSM_STATE_PATH}/current-bootstrap.complete" ]]; then
    log 'History bootstrap requires a completed, durable current-state bootstrap marker'
    exit 1
fi
