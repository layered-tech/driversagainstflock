#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.9"
readonly GRAPH_MOUNT="/var/lib/graphhopper"
readonly STAGING_MOUNT="/mnt/daf-routing-graphs-compact"
readonly FSTAB_BACKUP="/etc/fstab.daf-routing-volume-migration"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR migrate-graph-volume must run as root" >&2
    exit 1
fi

if [[ "${1:-}" != "--old-volume-id" || ! "${2:-}" =~ ^vol-[0-9a-f]{17}$ || "${3:-}" != "--new-volume-id" || ! "${4:-}" =~ ^vol-[0-9a-f]{17}$ ]]; then
    echo "ERROR usage: migrate-graph-volume.sh --old-volume-id vol-XXXXXXXXXXXXXXXXX --new-volume-id vol-XXXXXXXXXXXXXXXXX" >&2
    exit 1
fi

readonly OLD_VOLUME_ID="$2"
readonly NEW_VOLUME_ID="$4"
readonly SCRIPT_MOUNT_TARGET="$(findmnt -nro TARGET -T "${BASH_SOURCE[0]}")"

if [[ "${SCRIPT_MOUNT_TARGET}" == "${GRAPH_MOUNT}" ]]; then
    echo "ERROR migration script must run outside the graph filesystem" >&2
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
    echo "ERROR both graph volumes must be attached" >&2
    exit 1
fi

readonly MOUNTED_GRAPH_DEVICE="$(findmnt -nro SOURCE "${GRAPH_MOUNT}")"

if [[ "$(readlink -f "${MOUNTED_GRAPH_DEVICE}")" != "$(readlink -f "${OLD_DEVICE}")" ]]; then
    echo "ERROR the expected old volume is not mounted at ${GRAPH_MOUNT}" >&2
    exit 1
fi

readonly NEW_DEVICE_SIZE="$(blockdev --getsize64 "${NEW_DEVICE}")"

if (( NEW_DEVICE_SIZE < 64 * 1024 * 1024 * 1024 )); then
    echo "ERROR replacement graph volume is smaller than 64 GiB" >&2
    exit 1
fi

dnf install -y rsync xfsprogs >/dev/null

new_filesystem="$(lsblk -ndo FSTYPE "${NEW_DEVICE}")"

if [[ -z "${new_filesystem}" ]]; then
    mkfs.xfs -L daf-compact "${NEW_DEVICE}" >/dev/null
elif [[ "${new_filesystem}" != "xfs" ]]; then
    echo "ERROR replacement graph volume has an unexpected filesystem" >&2
    exit 1
fi

install -d -o root -g root -m 0755 "${STAGING_MOUNT}"
mount "${NEW_DEVICE}" "${STAGING_MOUNT}"

cutover_started=false
migration_complete=false

rollback() {
    local exit_code=$?

    if [[ "${migration_complete}" == "true" ]]; then
        return
    fi

    if [[ "${cutover_started}" == "true" ]]; then
        systemctl stop graphhopper.service >/dev/null 2>&1 || true
        mountpoint --quiet "${GRAPH_MOUNT}" && umount "${GRAPH_MOUNT}" || true
        cp -a "${FSTAB_BACKUP}" /etc/fstab
        mount "${GRAPH_MOUNT}" >/dev/null 2>&1 || true
        systemctl start graphhopper.service >/dev/null 2>&1 || true
    else
        mountpoint --quiet "${STAGING_MOUNT}" && umount "${STAGING_MOUNT}" || true
    fi

    echo "ERROR graph volume migration rolled back" >&2
    exit "${exit_code}"
}

trap rollback EXIT

rsync -aHAX --numeric-ids --delete "${GRAPH_MOUNT}/" "${STAGING_MOUNT}/"

if [[ ! -f "${STAGING_MOUNT}/releases/current/graph-cache/properties" ]]; then
    echo "ERROR copied graph is missing its properties file" >&2
    exit 1
fi

systemctl stop graphhopper.service
rsync -aHAX --numeric-ids --delete "${GRAPH_MOUNT}/" "${STAGING_MOUNT}/"
sync

readonly OLD_UUID="$(blkid -s UUID -o value "${OLD_DEVICE}")"
readonly NEW_UUID="$(blkid -s UUID -o value "${NEW_DEVICE}")"

cp -a /etc/fstab "${FSTAB_BACKUP}"
awk -v graph_mount="${GRAPH_MOUNT}" -v new_uuid="${NEW_UUID}" '
    $2 == graph_mount {
        print "UUID=" new_uuid, graph_mount, "xfs defaults,nofail,nodev,nosuid 0 2"
        replaced = 1
        next
    }
    { print }
    END { if (!replaced) exit 1 }
' "${FSTAB_BACKUP}" > /etc/fstab

cutover_started=true
umount "${STAGING_MOUNT}"
umount "${GRAPH_MOUNT}"
mount "${GRAPH_MOUNT}"

if [[ "$(findmnt -nro UUID "${GRAPH_MOUNT}")" != "${NEW_UUID}" ]]; then
    echo "ERROR replacement graph volume did not mount" >&2
    exit 1
fi

if [[ "$(findmnt -nro OPTIONS "${GRAPH_MOUNT}")" != *nodev* || "$(findmnt -nro OPTIONS "${GRAPH_MOUNT}")" != *nosuid* ]]; then
    echo "ERROR replacement graph volume is missing required mount options" >&2
    exit 1
fi

systemctl start graphhopper.service

ready=false

for _ in $(seq 1 180); do
    if curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8989/info; then
        ready=true
        break
    fi

    if ! systemctl is-active --quiet graphhopper.service; then
        break
    fi

    sleep 2
done

if [[ "${ready}" != "true" ]]; then
    echo "ERROR GraphHopper did not become ready on the replacement volume" >&2
    exit 1
fi

if findmnt -rn -S "UUID=${OLD_UUID}" >/dev/null; then
    echo "ERROR old graph volume remains mounted" >&2
    exit 1
fi

migration_complete=true
trap - EXIT
echo "MIGRATE_OK operation=${OPERATION_VERSION} graph=healthy old_volume=detached-filesystem new_volume=active"
