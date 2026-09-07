#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common-core.sh
source /opt/daf-osm/bin/common-core.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/global-changeset-bootstrap.complete"
readonly ACTIVATION_MARKER="${OSM_STATE_PATH}/global-changeset.complete"
readonly CHANGESET_STATE="${OSM_STATE_PATH}/global-changeset-replication.state"

(( EUID == 0 )) || die 'Changeset feed activation must run as root'
require_file "${BOOTSTRAP_MARKER}"
require_file "${CHANGESET_STATE}"

marker_partial="${ACTIVATION_MARKER}.partial"
printf 'sequence=%s\nactivated_at=%s\n' \
    "$(state_sequence "${CHANGESET_STATE}")" \
    "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" \
    > "${marker_partial}"
chown osm_ingest:osm_ingest "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${ACTIVATION_MARKER}"

systemctl enable --now daf-osm-changeset-update.timer daf-osm-changeset-backfill.timer
systemctl is-enabled --quiet daf-osm-changeset-update.timer
systemctl is-enabled --quiet daf-osm-changeset-backfill.timer
systemctl is-active --quiet daf-osm-changeset-update.timer
systemctl is-active --quiet daf-osm-changeset-backfill.timer
log 'Independent changeset update and backfill timers activated'
