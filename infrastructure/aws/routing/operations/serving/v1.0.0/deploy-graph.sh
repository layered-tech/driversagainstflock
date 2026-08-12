#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.0"
readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly GRAPH_ROOT="/var/lib/graphhopper/releases"

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
readonly PREVIOUS_TARGET="$(readlink "${GRAPH_ROOT}/current" 2>/dev/null || true)"

rollback() {
    local exit_code=$?

    if (( exit_code != 0 )) && [[ -n "${PREVIOUS_TARGET}" ]]; then
        ln -sfn "${PREVIOUS_TARGET}" "${GRAPH_ROOT}/current.rollback"
        mv -Tf "${GRAPH_ROOT}/current.rollback" "${GRAPH_ROOT}/current"
        systemctl restart graphhopper.service >/dev/null 2>&1 || true
    fi

    exit "${exit_code}"
}

trap rollback EXIT

if [[ -e "${RELEASE_DIR}" ]]; then
    echo "ERROR release directory already exists" >&2
    exit 1
fi

install -d -o root -g graphhopper -m 0750 "${STAGING_DIR}"
aws s3 cp --region "${AWS_REGION}" --no-progress "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/manifest.json" "${MANIFEST_PATH}"
aws s3 cp --region "${AWS_REGION}" --no-progress "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/graph-cache.tar.zst" "${ARCHIVE_PATH}"

readonly EXPECTED_SHA256="$(jq -r '.archive.sha256' "${MANIFEST_PATH}")"
readonly EXPECTED_SIZE_BYTES="$(jq -r '.archive.size_bytes' "${MANIFEST_PATH}")"

if [[ ! "${EXPECTED_SHA256}" =~ ^[0-9a-f]{64}$ || ! "${EXPECTED_SIZE_BYTES}" =~ ^[0-9]+$ ]]; then
    echo "ERROR invalid artifact manifest" >&2
    exit 1
fi

[[ "$(stat -c '%s' "${ARCHIVE_PATH}")" == "${EXPECTED_SIZE_BYTES}" ]] || { echo "ERROR artifact size mismatch" >&2; exit 1; }
printf '%s  %s\n' "${EXPECTED_SHA256}" "${ARCHIVE_PATH}" | sha256sum --check --status

tar --zstd -xf "${ARCHIVE_PATH}" -C "${STAGING_DIR}"
rm -f "${ARCHIVE_PATH}"

[[ -f "${STAGING_DIR}/graph-cache/properties" ]] || { echo "ERROR graph properties missing" >&2; exit 1; }
chown -R root:graphhopper "${STAGING_DIR}/graph-cache"
find "${STAGING_DIR}/graph-cache" -type d -exec chmod 0750 {} +
find "${STAGING_DIR}/graph-cache" -type f -exec chmod 0640 {} +
mv "${STAGING_DIR}" "${RELEASE_DIR}"

ln -sfn "${RELEASE_ID}" "${GRAPH_ROOT}/current.next"
mv -Tf "${GRAPH_ROOT}/current.next" "${GRAPH_ROOT}/current"
systemctl restart graphhopper.service

ready=false

for _ in $(seq 1 180); do
    if curl --fail --silent --output /dev/null http://127.0.0.1:8989/info; then
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

trap - EXIT
echo "DEPLOY_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} service=active"
