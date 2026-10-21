#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 3 ]] || { echo 'Usage: run-reviewed-corridor.sh RELEASE PBF_NAME PBF_MD5' >&2; exit 1; }
readonly RELEASE="$1" PBF_NAME="$2" PBF_MD5="$3"
[[ "${RELEASE}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || exit 1
[[ "${PBF_NAME}" =~ ^us-[0-9]{6}\.osm\.pbf$ && "${PBF_MD5}" =~ ^[a-f0-9]{32}$ ]] || exit 1
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MOUNT=/mnt/daf-build
readonly BUCKET=daf-routing-graphs-326364278889-us-east-1
readonly OUTPUT="${MOUNT}/output/national-corridor-${RELEASE}"
readonly READBACK="${MOUNT}/output/national-corridor-readback-${RELEASE}"
readonly REVIEW="${ROOT}/geometry-review.json"
readonly STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
source "${ROOT}/national-build-diagnostics.sh"
PHASE=exporting
status() {
    PHASE="$1"
    jq -nc --arg release "${RELEASE}" --arg phase "${PHASE}" --arg started "${STARTED}" \
        --arg updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg source "${PBF_NAME}" \
        '{release:$release,phase:$phase,started_at:$started,updated_at:$updated,source:$source}' > "${ROOT}/build-status.json"
    aws s3 cp --region us-east-1 --no-progress "${ROOT}/build-status.json" \
        "s3://${BUCKET}/experimental/road-corridors/${RELEASE}/us/build-status.json" --content-type application/json
    echo "NATIONAL_CORRIDOR phase=${PHASE} release=${RELEASE}"
}
finish() {
    local exit_code=$? failed_phase="${PHASE}"
    trap - EXIT ERR
    set +e
    if (( exit_code != 0 )); then status "failed-${PHASE}" || true; fi
    finish_build_diagnostics "${exit_code}" "${failed_phase}" "${RELEASE}"
    exit "${exit_code}"
}
trap finish EXIT
start_build_diagnostics "${ROOT}/diagnostics" "${MOUNT}" "s3://${BUCKET}/experimental/road-corridors/${RELEASE}/us"
status exporting
NATIONAL_CORRIDOR_EXPORT_ONLY=1 bash "${ROOT}/run-corridor.sh" "${RELEASE}" "${PBF_NAME}" "${PBF_MD5}"
cp "${OUTPUT}/source-geometry.jsonl" "${ROOT}/diagnostics/source-geometry.jsonl"
cp "${OUTPUT}/manifest.json" "${ROOT}/diagnostics/manifest.json"
upload_build_diagnostics
status reviewing-source-geometry
node "${ROOT}/automatic-source-geometry-review.mjs" "${OUTPUT}" "${REVIEW}"
cp "${REVIEW}" "${ROOT}/diagnostics/geometry-review.json"
upload_build_diagnostics
status validating-publishing
node "${ROOT}/publish-and-promote.mjs" "${OUTPUT}" "${READBACK}" "${RELEASE}" "${PBF_MD5}" "${BUCKET}" "${REVIEW}"
status published
echo "NATIONAL_CORRIDOR_OK release=${RELEASE}"
