#!/usr/bin/env bash

set -euo pipefail

readonly OPERATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly RELEASE_DIR="${OPERATIONS_DIR}/v1.0.4"

while IFS= read -r operation_script; do
    bash -n "${operation_script}"
done < <(find "${OPERATIONS_DIR}" -type f -name '*.sh' ! -path '*/test.sh' -print | sort)

grep -qF 'readonly GRAPHHOPPER_VERSION="11.0"' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'readonly OPERATION_VERSION="1.0.4"' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'mkfs.xfs -L daf-graphs' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'map_hash_bucket_size 128;' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'mountpoint --quiet "${GRAPH_MOUNT}"' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'graph.dataaccess.default_type: MMAP_RO' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'request_log:' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'appenders: []' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'access_log off;' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'listen 8080 default_server;' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'ConditionPathExists=/var/lib/graphhopper/releases/current/graph-cache/properties' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'logs=coordinate-free' "${RELEASE_DIR}/verify-serving.sh"

readonly BUILD_SCRIPT="${OPERATIONS_DIR}/build/v1.0.1/build-initial-graph.sh"
readonly DEPLOY_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.1/deploy-graph.sh"

grep -qF 'readonly PBF_NAME="us-260811.osm.pbf"' "${BUILD_SCRIPT}"
grep -qF 'readonly OPERATION_VERSION="1.0.1"' "${BUILD_SCRIPT}"
grep -qF 'readonly PBF_MD5="31b9933dd0d726ef6e7448a8d3b622ca"' "${BUILD_SCRIPT}"
grep -qF 'graph.dataaccess.default_type: MMAP' "${BUILD_SCRIPT}"
grep -qF 'prepare.lm.threads: 16' "${BUILD_SCRIPT}"
grep -qF 'write_progress complete 100 artifact-uploaded' "${BUILD_SCRIPT}"
grep -qF 'MetricName: "InitialGraphBuildProgress"' "${BUILD_SCRIPT}"
grep -qF 'operations/builds/${RELEASE_ID}/status.json' "${BUILD_SCRIPT}"
grep -qF 'readonly OPERATION_VERSION="1.0.1"' "${DEPLOY_SCRIPT}"
grep -qF 'dnf install -y jq zstd' "${DEPLOY_SCRIPT}"
grep -qF 'mv -Tf "${GRAPH_ROOT}/current.next" "${GRAPH_ROOT}/current"' "${DEPLOY_SCRIPT}"
grep -qF 'trap rollback EXIT' "${DEPLOY_SCRIPT}"

if rg -n '(latitude|longitude|point=|coordinates)' "${RELEASE_DIR}"; then
    echo "Operation output must not include coordinate-bearing fields" >&2
    exit 1
fi

echo "operations-tests: PASS"
