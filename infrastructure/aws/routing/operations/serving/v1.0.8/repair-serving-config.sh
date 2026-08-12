#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.8"
readonly GRAPH_ROOT="/var/lib/graphhopper/releases"
readonly CONFIG_PATH="/etc/graphhopper/config.yml"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR repair-serving-config must run as root" >&2
    exit 1
fi

if [[ "${1:-}" != "--release-id" || ! "${2:-}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]]; then
    echo "ERROR invalid release ID" >&2
    exit 1
fi

readonly RELEASE_ID="$2"

if [[ "$(readlink "${GRAPH_ROOT}/current" 2>/dev/null || true)" != "${RELEASE_ID}" ]]; then
    echo "ERROR requested release is not current" >&2
    exit 1
fi

if [[ ! -f "${GRAPH_ROOT}/${RELEASE_ID}/graph-cache/properties" ]]; then
    echo "ERROR graph properties missing" >&2
    exit 1
fi

grep -qF 'routing.max_visited_nodes: 2147483647' "${CONFIG_PATH}" || { echo "ERROR unexpected route limit configuration" >&2; exit 1; }
grep -qF 'routing.non_ch.max_waypoint_distance: 6000000' "${CONFIG_PATH}" || { echo "ERROR unexpected waypoint distance configuration" >&2; exit 1; }

if ! grep -qF 'import.osm.ignored_highways:' "${CONFIG_PATH}"; then
    sed -i '/routing.non_ch.max_waypoint_distance:/a\  import.osm.ignored_highways: footway,construction,cycleway,path,steps' "${CONFIG_PATH}"
fi

sed -i '/graph.read_only: true/d' "${CONFIG_PATH}"
install -o graphhopper -g graphhopper -m 0640 /dev/null "${GRAPH_ROOT}/${RELEASE_ID}/graph-cache/gh.lock"
install -d -o root -g root -m 0755 /etc/systemd/system/graphhopper.service.d
cat > /etc/systemd/system/graphhopper.service.d/10-graph-lock.conf <<UNIT
[Service]
ReadWritePaths=${GRAPH_ROOT}/current/graph-cache/gh.lock
UNIT
systemctl daemon-reload

systemctl restart graphhopper.service
ready=false

for _ in $(seq 1 180); do
    if curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8989/info; then
        ready=true
        break
    fi

    if ! systemctl is-active --quiet graphhopper.service; then
        sleep 2
        continue
    fi

    sleep 2
done

if [[ "${ready}" != "true" ]]; then
    echo "ERROR repaired GraphHopper did not become ready" >&2
    exit 1
fi

echo "REPAIR_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} service=active"
