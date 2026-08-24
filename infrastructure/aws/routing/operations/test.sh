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

readonly BUILD_SCRIPT="${OPERATIONS_DIR}/build/v1.3.0/build-initial-graph.sh"
readonly BUILD_LAUNCHER="${OPERATIONS_DIR}/build-graph.sh"
readonly BUILD_STATUS="${OPERATIONS_DIR}/graph-status.sh"
readonly BUILDER_USER_DATA="${OPERATIONS_DIR}/builder-user-data.sh"
readonly COMPUTE_TERRAFORM="${OPERATIONS_DIR}/../compute.tf"
readonly MONITORING_TERRAFORM="${OPERATIONS_DIR}/../monitoring.tf"
readonly PARAMETERS_TERRAFORM="${OPERATIONS_DIR}/../parameters.tf"
readonly VARIABLES_TERRAFORM="${OPERATIONS_DIR}/../variables.tf"
readonly DEPLOY_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.8/deploy-graph.sh"
readonly REPAIR_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.8/repair-serving-config.sh"
readonly MIGRATE_VOLUME_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.9/migrate-graph-volume.sh"
readonly SERVING_METRICS_SCRIPT="${OPERATIONS_DIR}/serving/v1.0.10/install-serving-metrics.sh"
readonly CLOUDWATCH_LOGS_SCRIPT="${OPERATIONS_DIR}/logging/v1.0.0/install-cloudwatch-logs.sh"

grep -qF 'readonly DEFAULT_PBF_NAME="us-260811.osm.pbf"' "${BUILD_SCRIPT}"
grep -qF 'readonly OPERATION_VERSION="1.3.0"' "${BUILD_SCRIPT}"
grep -qF 'readonly TELEMETRY_INTERVAL_SECONDS=15' "${BUILD_SCRIPT}"
grep -qF 'readonly DEFAULT_PBF_MD5="31b9933dd0d726ef6e7448a8d3b622ca"' "${BUILD_SCRIPT}"
grep -qF -- '--pbf-name' "${BUILD_SCRIPT}"
grep -qF -- '--pbf-md5' "${BUILD_SCRIPT}"
grep -qF 'graph.dataaccess.default_type: MMAP' "${BUILD_SCRIPT}"
grep -qF 'prepare.lm.threads: 16' "${BUILD_SCRIPT}"
grep -qF 'datareader.worker_threads: 8' "${BUILD_SCRIPT}"
grep -qF 'import.osm.ignored_highways: footway,construction,cycleway,path,steps' "${BUILD_SCRIPT}"
grep -qF 'sysctl -w vm.max_map_count=262144' "${BUILD_SCRIPT}"
grep -qF 'md5sum --check --status' "${BUILD_SCRIPT}"
grep -qF 'routing.max_visited_nodes: 2147483647' "${BUILD_SCRIPT}"
grep -qF 'routing.non_ch.max_waypoint_distance: 6000000' "${BUILD_SCRIPT}"
grep -qF 'if [[ ! -f "${GRAPH_PATH}/properties" ]]' "${BUILD_SCRIPT}"
grep -qF 'trap stop_server_and_finish EXIT' "${BUILD_SCRIPT}"
grep -qF 'write_progress complete 100 artifact-uploaded' "${BUILD_SCRIPT}"
grep -qF 'MetricName: "InitialGraphBuildProgress"' "${BUILD_SCRIPT}"
grep -qF 'MetricName: "BuilderCpuUsed"' "${BUILD_SCRIPT}"
grep -qF "' /proc/stat" "${BUILD_SCRIPT}"
grep -qF 'operations/builds/${RELEASE_ID}/status.json' "${BUILD_SCRIPT}"
grep -qF 'readonly BUILD_SCRIPT_VERSION="v1.3.0"' "${BUILD_LAUNCHER}"
grep -qF 'readonly STATUS_INTERVAL_SECONDS=15' "${BUILD_LAUNCHER}"
grep -qF 'BUILD_OK operation=1.3.0' "${BUILD_LAUNCHER}"
grep -qF 'temporary r8g.4xlarge' "${BUILD_LAUNCHER}"
grep -qF 'trap cleanup EXIT' "${BUILD_LAUNCHER}"
grep -qF 'aws ec2 terminate-instances' "${BUILD_LAUNCHER}"
grep -qF 'another builder already exists' "${BUILD_LAUNCHER}"
grep -qF 'The graph was built but not deployed.' "${BUILD_LAUNCHER}"
grep -qF 'Detached. The AWS build will continue independently.' "${BUILD_LAUNCHER}"
grep -qF 'TERMINAL_DETACHED=true' "${BUILD_LAUNCHER}"
grep -qF -- '--instance-initiated-shutdown-behavior terminate' "${BUILD_LAUNCHER}"
grep -qF 'OnBootSec=13h' "${BUILDER_USER_DATA}"
grep -qF 'ExecStart=/usr/bin/systemctl poweroff' "${BUILDER_USER_DATA}"
grep -qF 'systemctl is-active --quiet daf-routing-builder-expiry.timer' "${BUILD_LAUNCHER}"
grep -qF '/var/lib/cloud/instance/boot-finished' "${BUILD_LAUNCHER}"
grep -qF 'systemctl is-active --quiet amazon-cloudwatch-agent' "${BUILD_LAUNCHER}"
grep -qF "trap '\\''shutdown -h +1'\\'' EXIT" "${BUILD_LAUNCHER}"
grep -qF 'operations/active-build.json' "${BUILD_STATUS}"
grep -qF 'Refresh every 15 seconds' "${BUILD_STATUS}"
grep -qF 'readonly STATUS_INTERVAL_SECONDS=15' "${BUILD_STATUS}"
grep -qF 'Artifact: %s' "${BUILD_STATUS}"
grep -Eq 'update_default_version[[:space:]]*=[[:space:]]*true' "${COMPUTE_TERRAFORM}"
grep -qF 'MetricName=\"BuilderCpuUsed\"' "${MONITORING_TERRAFORM}"
grep -qF 'ignore_changes = [value]' "${PARAMETERS_TERRAFORM}"
grep -qF 'default     = "r8g.4xlarge"' "${VARIABLES_TERRAFORM}"
grep -qF 'default     = 128' "${VARIABLES_TERRAFORM}"
grep -qF 'readonly OPERATION_VERSION="1.0.9"' "${MIGRATE_VOLUME_SCRIPT}"
grep -qF 'rsync -aHAX --numeric-ids --delete' "${MIGRATE_VOLUME_SCRIPT}"
grep -qF 'cp -a "${FSTAB_BACKUP}" /etc/fstab' "${MIGRATE_VOLUME_SCRIPT}"
grep -qF 'MIGRATE_OK operation=${OPERATION_VERSION}' "${MIGRATE_VOLUME_SCRIPT}"
grep -qF 'SCRIPT_MOUNT_TARGET="$(findmnt -nro TARGET -T "${BASH_SOURCE[0]}")"' "${MIGRATE_VOLUME_SCRIPT}"
migration_filesystem_label="$(sed -n 's/.*mkfs.xfs -L \([^ ]*\).*/\1/p' "${MIGRATE_VOLUME_SCRIPT}")"

if (( ${#migration_filesystem_label} > 12 )); then
    echo "Migration filesystem label exceeds XFS's 12-character limit" >&2
    exit 1
fi
grep -qF 'readonly OPERATION_VERSION="1.0.10"' "${SERVING_METRICS_SCRIPT}"
grep -qF 'MetricName: "ServingGraphVolumeUsedPercent"' "${SERVING_METRICS_SCRIPT}"
grep -qF 'MetricName: "ServingMemoryUsedPercent"' "${SERVING_METRICS_SCRIPT}"
grep -qF 'OnUnitActiveSec=60s' "${SERVING_METRICS_SCRIPT}"
grep -qF 'RequiresMountsFor=/var/lib/graphhopper' "${SERVING_METRICS_SCRIPT}"
grep -qF 'ReadWritePaths=/run/daf-routing-serving-metrics' "${SERVING_METRICS_SCRIPT}"
grep -qF 'RuntimeDirectory=daf-routing-serving-metrics' "${SERVING_METRICS_SCRIPT}"
grep -qF '"ServingGraphVolumeUsedPercent"' "${MONITORING_TERRAFORM}"
grep -qF '"ServingMemoryUsedPercent"' "${MONITORING_TERRAFORM}"
grep -qF 'readonly OPERATION_VERSION="1.0.0"' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'dnf install -y amazon-cloudwatch-agent jq' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'if [[ ! -e "${LOG_FILE}" ]]' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'role must be serving or builder' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'LOG_FILE="/var/log/daf-routing/${ROLE}-events.log"' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF '"log_group_name": "/daf-routing/${ROLE}"' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF '"log_stream_name": "{instance_id}"' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'NRestarts' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'OnUnitActiveSec=60s' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s' "${CLOUDWATCH_LOGS_SCRIPT}"
grep -qF 'write_cloudwatch_event' "${BUILD_SCRIPT}"
grep -qF '"event":"build_progress"' "${BUILD_SCRIPT}"
grep -qF 'write_cloudwatch_event' "${OPERATIONS_DIR}/scheduled-builder/v1.0.0/run-build.sh"
grep -qF '"event":"workflow_state"' "${OPERATIONS_DIR}/scheduled-builder/v1.0.0/run-build.sh"

if rg -n 'journalctl|access.log|graphhopper.log|import.log|server.log|request_url' "${CLOUDWATCH_LOGS_SCRIPT}"; then
    echo "CloudWatch logging must collect only curated event files" >&2
    exit 1
fi
grep -qF 'title  = "Serving instance health"' "${MONITORING_TERRAFORM}"

dry_run_output="$("${BUILD_LAUNCHER}" \
    --dry-run \
    --detach \
    --release-id 20260814T120000Z-us-v1 \
    --pbf-name us-260811.osm.pbf \
    --pbf-md5 31b9933dd0d726ef6e7448a8d3b622ca)"
grep -qF 'Road snapshot: us-260811.osm.pbf' <<< "${dry_run_output}"
grep -qF 'Dry run complete; AWS was not contacted.' <<< "${dry_run_output}"
grep -qF 'Usage: npm run graph:status -- [--watch]' < <("${BUILD_STATUS}" --help)

status_output="$({
    aws() {
        local arguments="$*"

        if [[ "${arguments}" == *operations/active-build.json* ]]; then
            printf '%s\n' '{"release_id":"20260814T120000Z-us-v1","pbf_name":"us-260811.osm.pbf","instance_id":"i-0123456789abcdef0","command_id":"00000000-0000-0000-0000-000000000000","started_at":"2026-08-14T12:00:00Z"}'
        elif [[ "${arguments}" == *describe-instances* ]]; then
            echo running
        elif [[ "${arguments}" == *get-command-invocation* ]]; then
            echo InProgress
        elif [[ "${arguments}" == *operations/builds/*/status.json* ]]; then
            printf '%s\n' '{"percent":72,"phase":"validate","detail":"starting-validation-server","resources":{"cpu_used_percent":83.25,"memory_used_percent":61.5,"scratch_used_percent":44.75}}'
        elif [[ "${arguments}" == *head-object* ]]; then
            return 1
        else
            return 1
        fi
    }
    set --
    source "${BUILD_STATUS}"
})"
grep -qF 'Instance: i-0123456789abcdef0 (running)' <<< "${status_output}"
grep -qF 'Command:  InProgress' <<< "${status_output}"
grep -qF 'Progress: 72% — validate (starting-validation-server)' <<< "${status_output}"
grep -qF 'Resources: CPU 83.25% | Memory 61.5% | Scratch 44.75%' <<< "${status_output}"
grep -qF 'Artifact: no' <<< "${status_output}"
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

bash "${OPERATIONS_DIR}/scheduled-builder-test.sh"

echo "operations-tests: PASS"
