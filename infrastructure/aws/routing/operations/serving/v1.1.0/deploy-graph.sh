#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.1.0"
readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly GRAPH_ROOT="/var/lib/graphhopper/releases"
readonly CONFIG_PATH="/etc/graphhopper/config.yml"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR deploy-graph must run as root" >&2
    exit 1
fi

if [[ "${1:-}" != "--release-id" || ! "${2:-}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]]; then
    echo "ERROR invalid release ID" >&2
    exit 1
fi

readonly RELEASE_ID="$2"
readonly RELEASE_PREFIX="releases/${RELEASE_ID}"
readonly RELEASE_DIR="${GRAPH_ROOT}/${RELEASE_ID}"
readonly STAGING_DIR="${GRAPH_ROOT}/.${RELEASE_ID}.staging"
readonly ARCHIVE_PATH="${STAGING_DIR}/graph-cache.tar.zst"
readonly MANIFEST_PATH="${STAGING_DIR}/manifest.json"
readonly CONFIG_BACKUP="${GRAPH_ROOT}/.config.yml.before-${RELEASE_ID}"
readonly PREVIOUS_TARGET="$(readlink "${GRAPH_ROOT}/current" 2>/dev/null || true)"
PROMOTED=false

if [[ -n "${PREVIOUS_TARGET}" && ! "${PREVIOUS_TARGET}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]]; then
    echo "ERROR current graph target is invalid" >&2
    exit 1
fi

is_healthy() {
    systemctl is-active --quiet graphhopper.service \
        && curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8989/info
}

rollback() {
    local exit_code=$?

    trap - EXIT
    rm -rf "${STAGING_DIR}"

    if (( exit_code != 0 )); then
        if [[ -f "${CONFIG_BACKUP}" ]]; then
            cp -a "${CONFIG_BACKUP}" "${CONFIG_PATH}"
            rm -f "${CONFIG_BACKUP}"
        fi

        if [[ "${PROMOTED}" == "true" && -n "${PREVIOUS_TARGET}" ]]; then
            ln -sfn "${PREVIOUS_TARGET}" "${GRAPH_ROOT}/current.rollback"
            mv -Tf "${GRAPH_ROOT}/current.rollback" "${GRAPH_ROOT}/current"
            systemctl restart graphhopper.service >/dev/null 2>&1 || true
            rm -rf "${RELEASE_DIR}"
        fi
    fi

    exit "${exit_code}"
}

trap rollback EXIT

if [[ "${PREVIOUS_TARGET}" == "${RELEASE_ID}" ]]; then
    if is_healthy; then
        trap - EXIT
        echo "DEPLOY_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} service=already-current"
        exit 0
    fi

    echo "ERROR current release is not healthy" >&2
    exit 1
fi

rm -rf "${STAGING_DIR}"

if [[ -e "${RELEASE_DIR}" ]]; then
    rm -rf "${RELEASE_DIR}"
fi

dnf install -y jq zstd >/dev/null
install -d -o root -g graphhopper -m 0750 "${STAGING_DIR}"
cp -a "${CONFIG_PATH}" "${CONFIG_BACKUP}"
aws s3 cp --region "${AWS_REGION}" --no-progress "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/manifest.json" "${MANIFEST_PATH}"
aws s3 cp --region "${AWS_REGION}" --no-progress "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/graph-cache.tar.zst" "${ARCHIVE_PATH}"

readonly EXPECTED_RELEASE_ID="$(jq -r '.release_id' "${MANIFEST_PATH}")"
readonly EXPECTED_ARCHIVE_KEY="$(jq -r '.archive.key' "${MANIFEST_PATH}")"
readonly EXPECTED_SHA256="$(jq -r '.archive.sha256' "${MANIFEST_PATH}")"
readonly EXPECTED_SIZE_BYTES="$(jq -r '.archive.size_bytes' "${MANIFEST_PATH}")"

if [[ "${EXPECTED_RELEASE_ID}" != "${RELEASE_ID}" \
    || "${EXPECTED_ARCHIVE_KEY}" != "graph-cache.tar.zst" \
    || ! "${EXPECTED_SHA256}" =~ ^[0-9a-f]{64}$ \
    || ! "${EXPECTED_SIZE_BYTES}" =~ ^[0-9]+$ ]]; then
    echo "ERROR invalid artifact manifest" >&2
    exit 1
fi

[[ "$(stat -c '%s' "${ARCHIVE_PATH}")" == "${EXPECTED_SIZE_BYTES}" ]] \
    || { echo "ERROR artifact size mismatch" >&2; exit 1; }
printf '%s  %s\n' "${EXPECTED_SHA256}" "${ARCHIVE_PATH}" | sha256sum --check --status

tar --zstd -xf "${ARCHIVE_PATH}" -C "${STAGING_DIR}"
rm -f "${ARCHIVE_PATH}"
[[ -f "${STAGING_DIR}/graph-cache/properties" ]] \
    || { echo "ERROR graph properties missing" >&2; exit 1; }
chown -R root:graphhopper "${STAGING_DIR}/graph-cache"
find "${STAGING_DIR}/graph-cache" -type d -exec chmod 0750 {} +
find "${STAGING_DIR}/graph-cache" -type f -exec chmod 0640 {} +
mv "${STAGING_DIR}" "${RELEASE_DIR}"

ensure_config_value() {
    local current_value="$1"
    local expected_value="$2"

    if grep -qF "${expected_value}" "${CONFIG_PATH}"; then
        return 0
    fi

    grep -qF "${current_value}" "${CONFIG_PATH}" \
        || { echo "ERROR unexpected serving configuration" >&2; exit 1; }
    sed -i "s/${current_value}/${expected_value}/" "${CONFIG_PATH}"
}

ensure_config_value \
    'routing.max_visited_nodes: 1000000' \
    'routing.max_visited_nodes: 2147483647'
ensure_config_value \
    'routing.non_ch.max_waypoint_distance: 1000000' \
    'routing.non_ch.max_waypoint_distance: 6000000'

if ! grep -qF 'import.osm.ignored_highways: footway,construction,cycleway,path,steps' "${CONFIG_PATH}"; then
    if grep -qF 'import.osm.ignored_highways:' "${CONFIG_PATH}"; then
        echo "ERROR unexpected ignored-highways configuration" >&2
        exit 1
    fi

    sed -i \
        '/routing.non_ch.max_waypoint_distance:/a\  import.osm.ignored_highways: footway,construction,cycleway,path,steps' \
        "${CONFIG_PATH}"
fi

sed -i '/graph.read_only: true/d' "${CONFIG_PATH}"
install -o graphhopper -g graphhopper -m 0640 /dev/null "${RELEASE_DIR}/graph-cache/gh.lock"
install -d -o root -g root -m 0755 /etc/systemd/system/graphhopper.service.d
cat > /etc/systemd/system/graphhopper.service.d/10-graph-lock.conf <<UNIT
[Service]
ReadWritePaths=${GRAPH_ROOT}/current/graph-cache/gh.lock
UNIT
systemctl daemon-reload

ln -sfn "${RELEASE_ID}" "${GRAPH_ROOT}/current.next"
mv -Tf "${GRAPH_ROOT}/current.next" "${GRAPH_ROOT}/current"
PROMOTED=true
systemctl restart graphhopper.service

ready=false
for _ in $(seq 1 180); do
    if is_healthy; then
        ready=true
        break
    fi

    if ! systemctl is-active --quiet graphhopper.service; then
        break
    fi

    sleep 2
done

if [[ "${ready}" != "true" ]]; then
    echo "ERROR deployed GraphHopper did not become ready" >&2
    exit 1
fi

for local_release_dir in "${GRAPH_ROOT}"/*-us-v*; do
    [[ -d "${local_release_dir}" ]] || continue
    local_release_id="$(basename "${local_release_dir}")"

    if [[ "${local_release_id}" != "${RELEASE_ID}" && "${local_release_id}" != "${PREVIOUS_TARGET}" ]]; then
        rm -rf "${local_release_dir}"
    fi
done

rm -f "${CONFIG_BACKUP}"
trap - EXIT
echo "DEPLOY_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} service=active"
