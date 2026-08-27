#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common-core.sh
source /opt/daf-osm/bin/common-core.sh

readonly PREPARED_MARKER="${OSM_STATE_PATH}/global-rebuild.prepared"
readonly BACKUP_MARKER="${OSM_STATE_PATH}/backup.complete"
readonly PHASE_SEVEN_BACKUP_MARKER="${OSM_STATE_PATH}/phase7-backup.complete"
readonly PHASE_SEVEN_MARKER="${OSM_STATE_PATH}/history-bootstrap-source-removed.complete"

preserve_phase_seven_state()
{
    local source_name="$1"
    local preserved_name="$2"
    local source_path="${OSM_STATE_PATH}/${source_name}"
    local preserved_path="${OSM_STATE_PATH}/${preserved_name}"

    if [[ -f "${preserved_path}" ]]; then
        require_file "${preserved_path}"
        return 0
    fi

    require_file "${source_path}"
    install --mode=0640 --owner=osm_ingest --group=osm_ingest \
        "${source_path}" \
        "${preserved_path}"
}

restore_runtime_lock_ownership()
{
    chown osm_ingest:osm_ingest \
        /run/daf-osm/backup.lock \
        /run/daf-osm/global.lock \
        /run/daf-osm/global-current.lock \
        /run/daf-osm/global-history.lock
    chmod 0640 \
        /run/daf-osm/backup.lock \
        /run/daf-osm/global.lock \
        /run/daf-osm/global-current.lock \
        /run/daf-osm/global-history.lock
}

if [[ -f "${PREPARED_MARKER}" ]]; then
    require_file "${PREPARED_MARKER}"
    log 'Global in-place rebuild is already prepared'
    exit 0
fi

require_file "${PHASE_SEVEN_MARKER}"
systemctl disable --now \
    daf-osm-current-update.timer \
    daf-osm-history-update.timer \
    daf-osm-global-update.timer \
    daf-osm-metrics.timer \
    daf-osm-backup.timer \
    2>/dev/null || true

systemctl stop daf-osm-metrics.service 2>/dev/null || true
install --directory --mode=0750 --owner=osm_ingest --group=osm_ingest /run/daf-osm
exec 9> /run/daf-osm/backup.lock
flock --exclusive 9
exec 8> /run/daf-osm/global.lock
flock --exclusive 8
exec 7> /run/daf-osm/global-current.lock
flock --exclusive 7
exec 6> /run/daf-osm/global-history.lock
flock --exclusive 6
trap restore_runtime_lock_ownership EXIT

preserve_phase_seven_state current-bootstrap.complete phase7-current-bootstrap.complete
preserve_phase_seven_state history-bootstrap.complete phase7-history-bootstrap.complete
preserve_phase_seven_state validation.complete phase7-validation.complete
preserve_phase_seven_state \
    history-bootstrap-source-removed.complete \
    phase7-history-bootstrap-source-removed.complete

if [[ -f "${PHASE_SEVEN_BACKUP_MARKER}" ]]; then
    rollback_backup_marker="${PHASE_SEVEN_BACKUP_MARKER}"
else
    require_file "${BACKUP_MARKER}"
    install --mode=0640 --owner=osm_ingest --group=osm_ingest \
        "${BACKUP_MARKER}" \
        "${PHASE_SEVEN_BACKUP_MARKER}"
    rollback_backup_marker="${PHASE_SEVEN_BACKUP_MARKER}"
fi

backup_current_sequence="$(state_value "${rollback_backup_marker}" current_sequence)"
backup_history_sequence="$(state_value "${rollback_backup_marker}" history_sequence)"
[[ "${backup_current_sequence}" =~ ^[0-9]+$ && "${backup_history_sequence}" =~ ^[0-9]+$ ]] \
    || die 'Phase 7 verified-backup marker has invalid cursors'

runuser --user postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username=postgres \
    --dbname="${DATABASE_NAME}" <<'DROP_EXISTING_OSM_SCHEMAS_SQL'
DROP SCHEMA IF EXISTS osm_ingest CASCADE;
DROP SCHEMA IF EXISTS osm_pipeline CASCADE;
DROP SCHEMA IF EXISTS osm_current CASCADE;
DROP SCHEMA IF EXISTS osm_history CASCADE;
DROP_EXISTING_OSM_SCHEMAS_SQL

runuser --user postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username=postgres \
    --dbname="${DATABASE_NAME}" \
    --set=database_name="${DATABASE_NAME}" \
    --file=/opt/daf-osm/database/schema.sql

rm --force -- \
    "${OSM_STATE_PATH}/current-bootstrap.complete" \
    "${OSM_STATE_PATH}/current-replication.state" \
    "${OSM_STATE_PATH}/history-bootstrap.complete" \
    "${OSM_STATE_PATH}/history-replication.state" \
    "${OSM_STATE_PATH}/backup.complete" \
    "${OSM_STATE_PATH}/validation.complete" \
    "${OSM_STATE_PATH}/global-current-bootstrap.complete" \
    "${OSM_STATE_PATH}/global-current-replication.state" \
    "${OSM_STATE_PATH}/global-history-bootstrap.complete" \
    "${OSM_STATE_PATH}/global-history-replication.state" \
    "${OSM_STATE_PATH}/global-replication.state" \
    "${OSM_STATE_PATH}/global-stack.complete" \
    "${OSM_STATE_PATH}/global-validation.complete" \
    "${OSM_STATE_PATH}/global-history-bootstrap-source-removed.complete" \
    "${OSM_STATE_PATH}/global-history-bootstrap-source-removal.pending"

find "${OSM_DOWNLOAD_PATH}" \
    -xdev \
    -mindepth 1 \
    -maxdepth 1 \
    -type f \
    -name '*.poly' \
    -delete

if [[ -e "${OSM_DATA_PATH}/global-replication-spool" ]]; then
    [[ "${OSM_DATA_PATH}" == "${DATA_MOUNT_PATH}/osm" ]] \
        || die 'Refusing to reset a spool outside the configured OSM data path'
    rm --recursive --force -- "${OSM_DATA_PATH}/global-replication-spool"
fi

marker_partial="${PREPARED_MARKER}.partial"
printf 'rollback_current_sequence=%s\nrollback_history_sequence=%s\nprepared_at=%s\n' \
    "${backup_current_sequence}" \
    "${backup_history_sequence}" \
    "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" \
    > "${marker_partial}"
chown osm_ingest:osm_ingest "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${PREPARED_MARKER}"

log "Prepared in-place global rebuild with Phase 7 rollback cursors ${backup_current_sequence}/${backup_history_sequence}"
