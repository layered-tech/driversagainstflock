#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID} == 0 && $# == 4 ]] || { echo 'Usage: build-national-source.sh SCRATCH_VOLUME RELEASE PBF_NAME PBF_MD5' >&2; exit 1; }
readonly VOLUME="$1" RELEASE="$2" PBF_NAME="$3" PBF_MD5="$4"
[[ "${VOLUME}" =~ ^vol-[0-9a-f]{17}$ && "${RELEASE}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || exit 1
[[ "${PBF_NAME}" =~ ^us-[0-9]{6}\.osm\.pbf$ && "${PBF_MD5}" =~ ^[a-f0-9]{32}$ ]] || exit 1
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MOUNT=/mnt/daf-build
readonly BUCKET=daf-routing-graphs-326364278889-us-east-1
readonly STATUS_KEY="experimental/road-corridors/${RELEASE}/us/build-status.json"
readonly STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
source "${ROOT}/national-build-diagnostics.sh"
PHASE=setup
status() {
    PHASE="$1"
    jq -nc --arg release "${RELEASE}" --arg phase "${PHASE}" --arg started "${STARTED}" \
        --arg updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg source "${PBF_NAME}" \
        '{release:$release,phase:$phase,started_at:$started,updated_at:$updated,source:$source}' > "${ROOT}/build-status.json"
    aws s3 cp --region us-east-1 --no-progress "${ROOT}/build-status.json" "s3://${BUCKET}/${STATUS_KEY}" --content-type application/json
    echo "NATIONAL_CORRIDOR phase=${PHASE} release=${RELEASE}"
}
finish() {
    local exit_code=$?
    trap - EXIT ERR
    set +e
    local failed_phase="${PHASE}"
    if (( exit_code != 0 )); then status "failed-${PHASE}" || true; fi
    finish_build_diagnostics "${exit_code}" "${failed_phase}" "${RELEASE}"
    shutdown -h +1
    exit "${exit_code}"
}
trap finish EXIT
start_build_diagnostics "${ROOT}/diagnostics" "${MOUNT}" "s3://${BUCKET}/experimental/road-corridors/${RELEASE}/us"

dnf install -y jq xfsprogs java-17-amazon-corretto-headless
status setup
SCRATCH_DEVICE=""
for candidate in /dev/nvme*n1; do
    [[ -b "${candidate}" ]] || continue
    serial="$(lsblk -ndo SERIAL "${candidate}" | tr -d '[:space:]-')"
    if [[ "${serial}" == "${VOLUME//-/}" ]]; then SCRATCH_DEVICE="${candidate}"; break; fi
done
[[ -n "${SCRATCH_DEVICE}" ]] || { echo 'Expected scratch volume not attached' >&2; exit 1; }
readonly ROOT_SOURCE="$(findmnt -nro SOURCE /)"
readonly ROOT_PARENT="/dev/$(lsblk -ndo PKNAME "${ROOT_SOURCE}")"
[[ "${SCRATCH_DEVICE}" != "${ROOT_SOURCE}" && "${SCRATCH_DEVICE}" != "${ROOT_PARENT}" ]] || exit 1
(( $(blockdev --getsize64 "${SCRATCH_DEVICE}") >= 700 * 1024 * 1024 * 1024 )) || exit 1
filesystem="$(lsblk -ndo FSTYPE "${SCRATCH_DEVICE}")"
if [[ -z "${filesystem}" ]]; then
    mkfs.xfs -L daf-build "${SCRATCH_DEVICE}"
elif [[ "${filesystem}" != xfs ]]; then
    echo 'Unexpected scratch filesystem' >&2; exit 1
fi
install -d "${MOUNT}"
if ! mountpoint --quiet "${MOUNT}"; then mount -o nodev,nosuid "${SCRATCH_DEVICE}" "${MOUNT}"; fi
[[ "$(findmnt -nro SOURCE --target "${MOUNT}")" == "${SCRATCH_DEVICE}" ]] || exit 1
install -d "${MOUNT}/download" "${MOUNT}/output"
status downloading
curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 14400 \
    "https://download.geofabrik.de/north-america/${PBF_NAME}" -o "${MOUNT}/download/${PBF_NAME}.partial"
printf '%s  %s\n' "${PBF_MD5}" "${MOUNT}/download/${PBF_NAME}.partial" | md5sum --check --status
mv "${MOUNT}/download/${PBF_NAME}.partial" "${MOUNT}/download/${PBF_NAME}"
curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 600 \
    https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/11.0/graphhopper-web-11.0.jar \
    -o "${MOUNT}/download/graphhopper-web-11.0.jar"
printf '%s  %s\n' b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def \
    "${MOUNT}/download/graphhopper-web-11.0.jar" | sha256sum --check --status
status exporting
NATIONAL_CORRIDOR_EXPORT_ONLY=1 bash -x "${ROOT}/run-corridor.sh" "${RELEASE}" "${PBF_NAME}" "${PBF_MD5}"
readonly OUTPUT="${MOUNT}/output/national-corridor-${RELEASE}"
readonly READBACK="${MOUNT}/output/national-corridor-readback-${RELEASE}"
readonly REVIEW="${ROOT}/geometry-review.json"
cp "${OUTPUT}/source-geometry.jsonl" "${ROOT}/diagnostics/source-geometry.jsonl"
cp "${OUTPUT}/manifest.json" "${ROOT}/diagnostics/manifest.json"
upload_build_diagnostics
review_arg=''
if (( $(jq -r '.invalid_source_geometry_count' "${OUTPUT}/manifest.json") > 0 )); then
    status awaiting-geometry-review
    for (( attempt=0; attempt<240; attempt++ )); do
        [[ ! -f "${ROOT}/geometry-review.denied" ]] || { cat "${ROOT}/geometry-review.denied" >&2; exit 1; }
        if [[ -f "${REVIEW}" ]]; then break; fi
        sleep 15
    done
    [[ -f "${REVIEW}" ]] || { echo 'Source geometry review timed out; publication remains blocked' >&2; exit 1; }
    review_arg="${REVIEW}"
fi
status validating-publishing
node "${ROOT}/publish-and-promote.mjs" "${OUTPUT}" "${READBACK}" "${RELEASE}" "${PBF_MD5}" "${BUCKET}" "${review_arg}"
status published
echo "NATIONAL_CORRIDOR_OK release=${RELEASE}"
