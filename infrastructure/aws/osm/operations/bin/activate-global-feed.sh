#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common-core.sh
source /opt/daf-osm/bin/common-core.sh

require_file "${OSM_STATE_PATH}/global-stack.complete"
require_file "${OSM_STATE_PATH}/global-replication.state"
require_file "${OSM_STATE_PATH}/global-current-replication.state"
require_file "${OSM_STATE_PATH}/global-history-replication.state"

systemctl disable --now \
    daf-osm-current-update.timer \
    daf-osm-history-update.timer \
    2>/dev/null || true
systemctl enable --now \
    daf-osm-global-update.timer \
    daf-osm-metrics.timer

systemctl is-enabled --quiet daf-osm-global-update.timer \
    || die 'Shared global replication timer is not enabled'
systemctl is-active --quiet daf-osm-global-update.timer \
    || die 'Shared global replication timer is not active'
systemctl is-active --quiet daf-osm-metrics.timer \
    || die 'OSM metrics timer is not active'

log 'Shared global replication and metrics timers are enabled; legacy replication timers remain disabled'
