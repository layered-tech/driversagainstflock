#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common-core.sh
source /opt/daf-osm/bin/common-core.sh

readonly PHASE_SEVEN_BACKUP_MARKER="${OSM_STATE_PATH}/phase7-backup.complete"

(( EUID == 0 )) || die 'Phase 7 runtime-state restoration must run as root'

for preserved_marker in \
    phase7-current-bootstrap.complete \
    phase7-history-bootstrap.complete \
    phase7-validation.complete \
    phase7-backup.complete \
    phase7-history-bootstrap-source-removed.complete; do
    require_file "${OSM_STATE_PATH}/${preserved_marker}"
done
require_file "${OSM_STATE_PATH}/global-rebuild.prepared"

systemctl disable --now daf-osm-global-update.timer 2>/dev/null || true
systemctl disable --now daf-osm-backup.timer 2>/dev/null || true
systemctl stop daf-osm-global-update.service 2>/dev/null || true

install --directory --mode=0750 --owner=osm_ingest --group=osm_ingest /run/daf-osm
exec 9> /run/daf-osm/backup.lock
flock --exclusive 9
exec 8> /run/daf-osm/global.lock
flock --exclusive 8
exec 7> /run/daf-osm/global-current.lock
flock --exclusive 7
exec 6> /run/daf-osm/global-history.lock
flock --exclusive 6

IFS=$'\t' read -r \
    restored_current_sequence \
    restored_current_timestamp \
    restored_history_sequence \
    restored_history_timestamp \
    <<< "$(runuser --user osm_ingest -- env \
        PGHOST="${POSTGRESQL_SOCKET_DIR}" \
        PGPORT="${POSTGRESQL_PORT}" \
        PGDATABASE="${DATABASE_NAME}" \
        PGUSER=osm_ingest \
        psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --field-separator=$'\t' \
        --command="
SELECT
    (SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'),
    (SELECT state_value FROM osm_pipeline.state WHERE state_key = 'current_source_timestamp'),
    (SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'),
    (SELECT state_value FROM osm_pipeline.state WHERE state_key = 'history_source_timestamp')
")"

for restored_sequence in "${restored_current_sequence}" "${restored_history_sequence}"; do
    [[ "${restored_sequence}" =~ ^[0-9]+$ ]] \
        || die 'Restored Phase 7 database has an invalid replication sequence'
done
for restored_timestamp in "${restored_current_timestamp}" "${restored_history_timestamp}"; do
    [[ "${restored_timestamp}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
        || die 'Restored Phase 7 database has an invalid replication timestamp'
done

backup_current_sequence="$(state_value "${PHASE_SEVEN_BACKUP_MARKER}" current_sequence)"
backup_history_sequence="$(state_value "${PHASE_SEVEN_BACKUP_MARKER}" history_sequence)"
[[ "${backup_current_sequence}" =~ ^[0-9]+$ && "${backup_history_sequence}" =~ ^[0-9]+$ ]] \
    || die 'Preserved Phase 7 backup marker has invalid replication sequences'
(( restored_current_sequence >= backup_current_sequence \
    && restored_history_sequence >= backup_history_sequence )) \
    || die 'Restored database cursors predate the preserved Phase 7 backup observation'

write_restored_state()
{
    local destination="$1"
    local sequence="$2"
    local timestamp="$3"
    local escaped_timestamp="${timestamp//:/\\:}"
    local partial="${destination}.partial"

    printf 'sequenceNumber=%s\ntimestamp=%s\n' "${sequence}" "${escaped_timestamp}" > "${partial}"
    chown osm_ingest:osm_ingest "${partial}"
    chmod 0640 "${partial}"
    mv --force "${partial}" "${destination}"
}

write_restored_state \
    "${OSM_STATE_PATH}/current-replication.state" \
    "${restored_current_sequence}" \
    "${restored_current_timestamp}"
write_restored_state \
    "${OSM_STATE_PATH}/history-replication.state" \
    "${restored_history_sequence}" \
    "${restored_history_timestamp}"

for marker_name in \
    current-bootstrap.complete \
    history-bootstrap.complete \
    validation.complete \
    backup.complete \
    history-bootstrap-source-removed.complete; do
    install --mode=0640 --owner=osm_ingest --group=osm_ingest \
        "${OSM_STATE_PATH}/phase7-${marker_name}" \
        "${OSM_STATE_PATH}/${marker_name}"
done

rm --force -- \
    "${OSM_STATE_PATH}/global-current-bootstrap.complete" \
    "${OSM_STATE_PATH}/global-current-replication.state" \
    "${OSM_STATE_PATH}/global-history-bootstrap.complete" \
    "${OSM_STATE_PATH}/global-history-replication.state" \
    "${OSM_STATE_PATH}/global-replication.state" \
    "${OSM_STATE_PATH}/global-stack.complete" \
    "${OSM_STATE_PATH}/global-validation.complete"

log "Reconstructed Phase 7 runtime cursors ${restored_current_sequence}/${restored_history_sequence} from the restored database"
