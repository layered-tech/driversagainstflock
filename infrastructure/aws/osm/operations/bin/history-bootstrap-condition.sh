#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

if [[ ! -s "${OSM_STATE_PATH}/global-current-bootstrap.complete" ]]; then
    log 'Global history bootstrap requires a completed global current-state bootstrap marker'
    exit 1
fi
