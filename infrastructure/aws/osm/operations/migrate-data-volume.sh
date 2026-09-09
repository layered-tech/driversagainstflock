#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="2.0.0"
readonly DATA_MOUNT="/var/lib/daf-osm"
readonly STAGING_MOUNT="/mnt/daf-osm-data-canonical"
readonly FSTAB_BACKUP="/etc/fstab.daf-osm-volume-migration"
readonly FSTAB_PENDING="/etc/fstab.daf-osm-volume-migration.pending"
readonly DATABASE_NAME="${DAF_OSM_DATABASE_NAME:-daf_osm}"
readonly MINIMUM_REPLACEMENT_SIZE_BYTES=$((64 * 1024 * 1024 * 1024))
readonly MINIMUM_REFRESH_RESERVE_BYTES=$((16 * 1024 * 1024 * 1024))
readonly -a RUNTIME_TIMERS=(
    daf-osm-global-update.timer
    daf-osm-changeset-update.timer
    daf-osm-changeset-backfill.timer
    daf-osm-backup.timer
    daf-osm-metrics.timer
)
readonly -a RUNTIME_SERVICES=(
    daf-osm-global-update.service
    daf-osm-changeset-update.service
    daf-osm-changeset-backfill.service
    daf-osm-backup.service
    daf-osm-metrics.service
)

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR migrate-data-volume must run as root" >&2
    exit 1
fi

if [[ "${1:-}" != "--mode" || ! "${2:-}" =~ ^(rightsize|rollback)$ || "${3:-}" != "--old-volume-id" || ! "${4:-}" =~ ^vol-[0-9a-f]{17}$ || "${5:-}" != "--new-volume-id" || ! "${6:-}" =~ ^vol-[0-9a-f]{17}$ ]]; then
    echo "ERROR usage: migrate-data-volume.sh --mode rightsize|rollback --old-volume-id vol-XXXXXXXXXXXXXXXXX --new-volume-id vol-XXXXXXXXXXXXXXXXX" >&2
    exit 1
fi

readonly MIGRATION_MODE="$2"
readonly OLD_VOLUME_ID="$4"
readonly NEW_VOLUME_ID="$6"
readonly SCRIPT_MOUNT_TARGET="$(findmnt -nro TARGET -T "${BASH_SOURCE[0]}")"

if [[ "${SCRIPT_MOUNT_TARGET}" == "${DATA_MOUNT}" ]]; then
    echo "ERROR migration script must run outside the OSM data filesystem" >&2
    exit 1
fi

cd /

resolve_volume_device() {
    local expected_serial="${1//-/}"
    local candidate
    local serial

    for candidate in /dev/nvme*n1; do
        [[ -b "${candidate}" ]] || continue
        serial="$(lsblk -ndo SERIAL "${candidate}" | tr -d '[:space:]-')"

        if [[ "${serial}" == "${expected_serial}" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    return 1
}

readonly OLD_DEVICE="$(resolve_volume_device "${OLD_VOLUME_ID}" || true)"
readonly NEW_DEVICE="$(resolve_volume_device "${NEW_VOLUME_ID}" || true)"

if [[ -z "${OLD_DEVICE}" || -z "${NEW_DEVICE}" ]]; then
    echo "ERROR both OSM data volumes must be attached" >&2
    exit 1
fi

readonly MOUNTED_DATA_DEVICE="$(findmnt -nro SOURCE "${DATA_MOUNT}")"

if [[ "$(readlink -f "${MOUNTED_DATA_DEVICE}")" != "$(readlink -f "${OLD_DEVICE}")" ]]; then
    echo "ERROR the expected legacy volume is not mounted at ${DATA_MOUNT}" >&2
    exit 1
fi

readonly NEW_DEVICE_SIZE="$(blockdev --getsize64 "${NEW_DEVICE}")"
readonly OLD_DEVICE_SIZE="$(blockdev --getsize64 "${OLD_DEVICE}")"

if (( NEW_DEVICE_SIZE < MINIMUM_REPLACEMENT_SIZE_BYTES )); then
    echo "ERROR replacement OSM data volume is smaller than 64 GiB" >&2
    exit 1
fi

if [[ "${MIGRATION_MODE}" == "rightsize" ]] && (( NEW_DEVICE_SIZE >= OLD_DEVICE_SIZE )); then
    echo "ERROR replacement OSM data volume does not reduce provisioned capacity" >&2
    exit 1
fi

if [[ "${MIGRATION_MODE}" == "rollback" ]] && (( NEW_DEVICE_SIZE <= OLD_DEVICE_SIZE )); then
    echo "ERROR rollback OSM data volume does not restore greater provisioned capacity" >&2
    exit 1
fi

dnf install -y rsync xfsprogs >/dev/null

new_filesystem="$(lsblk -ndo FSTYPE "${NEW_DEVICE}")"

if [[ -z "${new_filesystem}" ]]; then
    mkfs.xfs -L daf-osm-new "${NEW_DEVICE}" >/dev/null
elif [[ "${new_filesystem}" != "xfs" ]]; then
    echo "ERROR replacement OSM data volume has an unexpected filesystem" >&2
    exit 1
fi

install -d -o root -g root -m 0755 "${STAGING_MOUNT}"
mount "${NEW_DEVICE}" "${STAGING_MOUNT}"

readonly SOURCE_USED_BYTES="$(df --block-size=1 --output=used "${DATA_MOUNT}" | tail --lines=1 | tr -d ' ')"
readonly NEW_FILESYSTEM_SIZE_BYTES="$(df --block-size=1 --output=size "${STAGING_MOUNT}" | tail --lines=1 | tr -d ' ')"

if (( SOURCE_USED_BYTES + MINIMUM_REFRESH_RESERVE_BYTES > NEW_FILESYSTEM_SIZE_BYTES )); then
    umount "${STAGING_MOUNT}"
    echo "ERROR replacement OSM data volume cannot retain 16 GiB of refresh headroom after migration" >&2
    exit 1
fi

declare -a timers_to_restart=()
for timer in "${RUNTIME_TIMERS[@]}"; do
    if systemctl is-active --quiet "${timer}"; then
        timers_to_restart+=("${timer}")
    fi
done

runtime_stopped=false
cutover_started=false
migration_complete=false

restart_runtime() {
    systemctl start postgresql.service

    if (( ${#timers_to_restart[@]} > 0 )); then
        systemctl start "${timers_to_restart[@]}"
    fi
}

rollback() {
    local exit_code=$?

    if [[ "${migration_complete}" == "true" ]]; then
        return
    fi

    if [[ "${cutover_started}" == "true" ]]; then
        systemctl stop "${RUNTIME_TIMERS[@]}" >/dev/null 2>&1 || true
        systemctl stop postgresql.service >/dev/null 2>&1 || true
        mountpoint --quiet "${DATA_MOUNT}" && umount "${DATA_MOUNT}" || true
        cp -a "${FSTAB_BACKUP}" /etc/fstab
        mount "${DATA_MOUNT}" >/dev/null 2>&1 || true
    else
        mountpoint --quiet "${STAGING_MOUNT}" && umount "${STAGING_MOUNT}" || true
    fi

    rm --force -- "${FSTAB_PENDING}"

    if [[ "${runtime_stopped}" == "true" ]]; then
        restart_runtime >/dev/null 2>&1 || true
    fi

    echo "ERROR OSM data volume migration rolled back" >&2
    exit "${exit_code}"
}

trap rollback EXIT

systemctl stop "${RUNTIME_TIMERS[@]}"
systemctl stop "${RUNTIME_SERVICES[@]}"
runtime_stopped=true

exec 9> /run/daf-osm/backup.lock
flock --exclusive 9
exec 8> /run/daf-osm/global.lock
flock --exclusive 8
exec 7> /run/daf-osm/global-current.lock
flock --exclusive 7
exec 6> /run/daf-osm/global-history.lock
flock --exclusive 6
exec 5> /run/daf-osm/global-changeset.lock
flock --exclusive 5
exec 4> /run/daf-osm/global-changeset-backfill.lock
flock --exclusive 4

systemctl stop postgresql.service

rsync -aHAX --numeric-ids --delete --one-file-system "${DATA_MOUNT}/" "${STAGING_MOUNT}/"
sync

if [[ ! -s "${STAGING_MOUNT}/postgresql/data/PG_VERSION" ]]; then
    echo "ERROR copied OSM data is missing the PostgreSQL cluster marker" >&2
    exit 1
fi

readonly COPY_DIFFERENCES="$(rsync -aHAXn --numeric-ids --delete --one-file-system --itemize-changes "${DATA_MOUNT}/" "${STAGING_MOUNT}/")"

if [[ -n "${COPY_DIFFERENCES}" ]]; then
    echo "ERROR final OSM data comparison found material differences" >&2
    exit 1
fi

readonly OLD_UUID="$(blkid -s UUID -o value "${OLD_DEVICE}")"
readonly NEW_UUID="$(blkid -s UUID -o value "${NEW_DEVICE}")"

cp -a /etc/fstab "${FSTAB_BACKUP}"
awk -v data_mount="${DATA_MOUNT}" -v new_uuid="${NEW_UUID}" '
    $2 == data_mount {
    print "UUID=" new_uuid, data_mount, "xfs defaults,nofail,nodev,nosuid,x-systemd.device-timeout=5min 0 2"
        replaced = 1
        next
    }
    { print }
    END { if (!replaced) exit 1 }
' "${FSTAB_BACKUP}" > "${FSTAB_PENDING}"

cutover_started=true
chown root:root "${FSTAB_PENDING}"
chmod 0644 "${FSTAB_PENDING}"
mv --force "${FSTAB_PENDING}" /etc/fstab
umount "${STAGING_MOUNT}"
umount "${DATA_MOUNT}"
mount "${DATA_MOUNT}"

if [[ "$(findmnt -nro UUID "${DATA_MOUNT}")" != "${NEW_UUID}" ]]; then
    echo "ERROR replacement OSM data volume did not mount" >&2
    exit 1
fi

if [[ "$(findmnt -nro OPTIONS "${DATA_MOUNT}")" != *nodev* || "$(findmnt -nro OPTIONS "${DATA_MOUNT}")" != *nosuid* ]]; then
    echo "ERROR replacement OSM data volume is missing required mount options" >&2
    exit 1
fi

systemctl start postgresql.service

if ! pg_isready --quiet --timeout=5 || ! runuser --user postgres -- psql --no-psqlrc --tuples-only --quiet --dbname="${DATABASE_NAME}" --command='SELECT 1' | grep -qF 1; then
    echo "ERROR PostgreSQL did not become ready on the replacement volume" >&2
    exit 1
fi

runuser --user osm_ingest -- /opt/daf-osm/bin/validate-core.sh

if (( ${#timers_to_restart[@]} > 0 )); then
    systemctl start "${timers_to_restart[@]}"
fi

if findmnt -rn -S "UUID=${OLD_UUID}" >/dev/null; then
    echo "ERROR legacy OSM data volume remains mounted" >&2
    exit 1
fi

migration_complete=true
trap - EXIT
echo "MIGRATE_OK operation=${OPERATION_VERSION} mode=${MIGRATION_MODE} postgresql=healthy old_volume=detached-filesystem new_volume=active"
