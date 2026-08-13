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
grep -qF 'client_max_body_size 0;' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'ConditionPathExists=/var/lib/graphhopper/releases/current/graph-cache/properties' "${RELEASE_DIR}/install-serving.sh"
grep -qF 'logs=coordinate-free' "${RELEASE_DIR}/verify-serving.sh"

readonly BUILD_SCRIPT="${OPERATIONS_DIR}/build/v1.0.5/build-initial-graph.sh"
readonly DEPLOY_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.8/deploy-graph.sh"
readonly REPAIR_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.8/repair-serving-config.sh"

grep -qF 'readonly PBF_NAME="us-260811.osm.pbf"' "${BUILD_SCRIPT}"
grep -qF 'readonly OPERATION_VERSION="1.0.5"' "${BUILD_SCRIPT}"
grep -qF 'readonly PBF_MD5="31b9933dd0d726ef6e7448a8d3b622ca"' "${BUILD_SCRIPT}"
grep -qF 'graph.dataaccess.default_type: MMAP' "${BUILD_SCRIPT}"
grep -qF 'prepare.lm.threads: 16' "${BUILD_SCRIPT}"
grep -qF 'import.osm.ignored_highways: footway,construction,cycleway,path,steps' "${BUILD_SCRIPT}"
grep -qF 'sysctl -w vm.max_map_count=262144' "${BUILD_SCRIPT}"
grep -qF 'md5sum --check --status' "${BUILD_SCRIPT}"
grep -qF 'routing.max_visited_nodes: 2147483647' "${BUILD_SCRIPT}"
grep -qF 'routing.non_ch.max_waypoint_distance: 6000000' "${BUILD_SCRIPT}"
grep -qF 'if [[ ! -f "${GRAPH_PATH}/properties" ]]' "${BUILD_SCRIPT}"
grep -qF 'trap stop_server_and_finish EXIT' "${BUILD_SCRIPT}"
grep -qF 'write_progress complete 100 artifact-uploaded' "${BUILD_SCRIPT}"
grep -qF 'MetricName: "InitialGraphBuildProgress"' "${BUILD_SCRIPT}"
grep -qF 'operations/builds/${RELEASE_ID}/status.json' "${BUILD_SCRIPT}"
grep -qF 'readonly OPERATION_VERSION="1.0.8"' "${DEPLOY_SCRIPT}"
grep -qF 'dnf install -y jq zstd' "${DEPLOY_SCRIPT}"
grep -qF "sed -i 's/routing.max_visited_nodes: 1000000/routing.max_visited_nodes: 2147483647/'" "${DEPLOY_SCRIPT}"
grep -qF "sed -i 's/routing.non_ch.max_waypoint_distance: 1000000/routing.non_ch.max_waypoint_distance: 6000000/'" "${DEPLOY_SCRIPT}"
grep -qF 'import.osm.ignored_highways: footway,construction,cycleway,path,steps' "${DEPLOY_SCRIPT}"
grep -qF 'ReadWritePaths=${GRAPH_ROOT}/current/graph-cache/gh.lock' "${DEPLOY_SCRIPT}"
grep -qF 'install -o graphhopper -g graphhopper -m 0640 /dev/null' "${DEPLOY_SCRIPT}"
grep -qF 'curl --max-time 5 --fail' "${REPAIR_SCRIPT}"
grep -qF 'REPAIR_OK operation=${OPERATION_VERSION}' "${REPAIR_SCRIPT}"
grep -qF 'mv -Tf "${GRAPH_ROOT}/current.next" "${GRAPH_ROOT}/current"' "${DEPLOY_SCRIPT}"
grep -qF 'trap rollback EXIT' "${DEPLOY_SCRIPT}"

if rg -n '(latitude|longitude|point=|coordinates)' "${RELEASE_DIR}"; then
    echo "Operation output must not include coordinate-bearing fields" >&2
    exit 1
fi

echo "operations-tests: PASS"
