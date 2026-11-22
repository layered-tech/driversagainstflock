#!/usr/bin/env bash

set -euo pipefail

readonly OPERATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROUTING_DIR="${OPERATIONS_DIR}/.."
readonly IAM_DIR="${ROUTING_DIR}/../iam"
readonly WORKFLOW="${OPERATIONS_DIR}/scheduled-builder/v1.4.0/run-build.sh"
readonly BUILD="${OPERATIONS_DIR}/build/v1.3.0/build-initial-graph.sh"
readonly SCHEDULED_USER_DATA="${OPERATIONS_DIR}/scheduled-builder-national-user-data.sh"
readonly ROUTING_ONLY_USER_DATA="${OPERATIONS_DIR}/scheduled-builder-user-data.sh"
readonly BOOTSTRAP_LOGGING="${OPERATIONS_DIR}/scheduled-builder-bootstrap-logging.sh"
readonly MANUAL_USER_DATA="${OPERATIONS_DIR}/builder-user-data.sh"
readonly LOGGING="${OPERATIONS_DIR}/logging/v1.0.0/install-cloudwatch-logs.sh"
readonly DEPLOY="${OPERATIONS_DIR}/serving/v1.1.0/deploy-graph.sh"
readonly STATUS="${OPERATIONS_DIR}/graph-status.sh"
readonly SCHEDULER_OPERATOR_POLICY="${IAM_DIR}/daf-routing-graph-build-scheduler-operator-policy.json"
readonly ROUTING_SERVICES_POLICY="${IAM_DIR}/daf-routing-services-policy.json"
readonly BUILD_SHA256="$(shasum -a 256 "${BUILD}" | awk '{print $1}')"
readonly DEPLOY_SHA256="$(shasum -a 256 "${DEPLOY}" | awk '{print $1}')"
readonly LOGGING_SHA256="$(shasum -a 256 "${LOGGING}" | awk '{print $1}')"
while IFS= read -r policy_file; do
    policy_character_count="$(tr -d '[:space:]' < "${policy_file}" | wc -c | tr -d ' ')"

    if ((policy_character_count > 6144)); then
        echo "IAM managed policy exceeds 6144 non-whitespace characters: ${policy_file} (${policy_character_count})" >&2
        exit 1
    fi
done < <(find "${IAM_DIR}" -maxdepth 1 -type f -name '*.json' -print | sort)

readonly WORKFLOW_SHA256="$(shasum -a 256 "${WORKFLOW}" | awk '{print $1}')"

grep -qF "readonly BUILD_SCRIPT_SHA256=\"${BUILD_SHA256}\"" "${WORKFLOW}"
grep -qF "readonly DEPLOY_SCRIPT_SHA256=\"${DEPLOY_SHA256}\"" "${WORKFLOW}"
grep -qF "readonly BOOTSTRAP_SHA256=\"${WORKFLOW_SHA256}\"" "${SCHEDULED_USER_DATA}"
grep -qF "readonly LOGGING_SHA256=\"${LOGGING_SHA256}\"" "${SCHEDULED_USER_DATA}"
grep -qF "readonly LOGGING_SHA256=\"${LOGGING_SHA256}\"" "${MANUAL_USER_DATA}"
grep -qF 'bash "${LOGGING_PATH}" builder' "${MANUAL_USER_DATA}"

scheduled_dry_run="$(${WORKFLOW} \
    --dry-run \
    --mode scheduled \
    --release-id 20260823T070000Z-us-v1 \
    --pbf-name us-260818.osm.pbf \
    --pbf-md5 31b9933dd0d726ef6e7448a8d3b622ca)"
grep -qF 'Mode: scheduled' <<< "${scheduled_dry_run}"
grep -qF 'Deployment: automatic' <<< "${scheduled_dry_run}"
grep -qF 'Dry run complete; AWS was not contacted.' <<< "${scheduled_dry_run}"

manual_dry_run="$(${WORKFLOW} \
    --dry-run \
    --mode manual \
    --release-id 20260823T070000Z-us-v1 \
    --pbf-name us-260818.osm.pbf \
    --pbf-md5 31b9933dd0d726ef6e7448a8d3b622ca \
    --scratch-volume-id vol-0123456789abcdef0 \
    --instance-id i-0123456789abcdef0)"
grep -qF 'Mode: manual' <<< "${manual_dry_run}"
grep -qF 'Deployment: deferred' <<< "${manual_dry_run}"

for discovery_script in "${WORKFLOW}" "${OPERATIONS_DIR}/build-graph.sh"; do
    discovered_dry_run="$(
        curl() {
            if [[ "${!#}" == "https://download.geofabrik.de/north-america/us.html" ]]; then
                printf '%s\n' '<a href="us-261008.osm.pbf.md5">older</a>' \
                    '<a href="us-261009.osm.pbf.md5">newest</a>' \
                    '<a href="us-261007.osm.pbf.md5">oldest</a>'
            elif [[ "${!#}" == "https://download.geofabrik.de/north-america/us-261009.osm.pbf.md5" ]]; then
                printf '%s\n' '0befc76d07878c8a68f1ed85948ea7a9  us-261009.osm.pbf'
            else
                echo "Unexpected snapshot discovery URL: ${!#}" >&2
                return 1
            fi
        }
        export -f curl
        bash "${discovery_script}" --dry-run --release-id 20261011T070000Z-us-v1
    )"
    grep -qF 'us-261009.osm.pbf' <<< "${discovered_dry_run}"
done

if "${WORKFLOW}" \
    --dry-run \
    --mode scheduled \
    --release-id 20260823T070000Z-us-v1 \
    --pbf-name us-260818.osm.pbf \
    --pbf-md5 invalid >/dev/null 2>&1; then
    echo "Scheduled workflow accepted an invalid PBF checksum" >&2
    exit 1
fi

grep -qF "grep -Eo 'us-[0-9]{6}\\.osm\\.pbf\\.md5'" "${WORKFLOW}"
grep -qF '[[ "${candidate}" != "${root_source}" && "${candidate}" != "${root_parent}" ]]' "${WORKFLOW}"
grep -qF '(( ${#candidates[@]} == 1 ))' "${WORKFLOW}"
grep -qF 'local exit_code=$?' "${WORKFLOW}"
grep -qF 'publish_state deployment_pending serving-not-running' "${WORKFLOW}"
grep -qF 'publish_state deployment_pending serving-ssm-offline' "${WORKFLOW}"
grep -qF 'aws ssm send-command' "${WORKFLOW}"
grep -qF 'aws ssm put-parameter' "${WORKFLOW}"
grep -qF 'publish_state deployed serving-healthy' "${WORKFLOW}"
grep -qF 'aws sns publish' "${WORKFLOW}"

if grep -qF 'aws ec2 start-instances' "${WORKFLOW}"; then
    echo "Scheduled workflow must not start the serving instance" >&2
    exit 1
fi

grep -qF 'trap finish EXIT' "${SCHEDULED_USER_DATA}"
grep -qF 'aws sns publish' "${SCHEDULED_USER_DATA}"
grep -qF 'OnBootSec=13h' "${SCHEDULED_USER_DATA}"
grep -qF 'run_bootstrap_script "${LOGGING_PATH}" builder' "${SCHEDULED_USER_DATA}"
grep -qF 'run_bootstrap_script "${BOOTSTRAP_PATH}" --mode scheduled' "${SCHEDULED_USER_DATA}"

if grep -Eq 'dnf install.*[[:space:]]curl([[:space:]]|$)' "${SCHEDULED_USER_DATA}"; then
    echo "Scheduled bootstrap must keep the Amazon Linux curl-minimal package" >&2
    exit 1
fi

test_bootstrap_logging() (
    local user_data="$1"
    local expected_exit="$2"
    local bootstrap_test_root actual_exit=0
    bootstrap_test_root="$(mktemp -d)"
    trap 'rm -rf "${bootstrap_test_root}"' EXIT
    export bootstrap_test_root bootstrap_case="$3"
    mkdir -p "${bootstrap_test_root}/systemd" "${bootstrap_test_root}/log/daf-routing" "${bootstrap_test_root}/bin"
    cat > "${bootstrap_test_root}/bin/dnf" <<'SCRIPT'
#!/bin/sh
echo 'dnf: package metadata unavailable' >&2
exit 72
SCRIPT
    cat > "${bootstrap_test_root}/bin/curl" <<'SCRIPT'
#!/usr/bin/env bash
case "${!#}" in
    */latest/api/token) echo mock-imds-token ;;
    */latest/meta-data/instance-id) echo i-0123456789abcdef0 ;;
    *) echo 'curl: snapshot checksum timed out' >&2; exit 28 ;;
esac
SCRIPT
    chmod +x "${bootstrap_test_root}/bin/dnf" "${bootstrap_test_root}/bin/curl"
    export PATH="${bootstrap_test_root}/bin:${PATH}"

    awk -v logging="${BOOTSTRAP_LOGGING}" '
        $0 == "# Scheduled bootstrap logging" {
            while ((getline line < logging) > 0) print line
            next
        }
        { print }
    ' "${user_data}" | sed \
        -e "s|/etc/systemd/system|${bootstrap_test_root}/systemd|g" \
        -e "s|/var/lib/daf-routing-build|${bootstrap_test_root}/build|g" \
        -e "s|/var/log/|${bootstrap_test_root}/log/|g" > "${bootstrap_test_root}/user-data.sh"

    systemctl() { :; }
    sha256sum() { cat >/dev/null; }
    shutdown() { touch "${bootstrap_test_root}/shutdown"; }
    aws() {
        case "$1 $2" in
            's3api head-object')
                if [[ "${bootstrap_case}" == "download" ]]; then
                    echo 'S3: service unavailable' >&2
                    return 71
                fi
                if [[ "$*" == *"/logging/"* ]]; then
                    sed -n 's/^readonly LOGGING_SHA256="\([^"]*\)"$/\1/p' "${bootstrap_test_root}/user-data.sh"
                else
                    sed -n 's/^readonly BOOTSTRAP_SHA256="\([^"]*\)"$/\1/p' "${bootstrap_test_root}/user-data.sh"
                fi ;;
            's3 cp')
                if [[ "$*" == *"/logging/"* ]]; then
                    cat > "${!#}" <<'SCRIPT'
set -euo pipefail
if [[ "${bootstrap_case}" == "install" ]]; then
    dnf install -y amazon-cloudwatch-agent > "${bootstrap_test_root}/log/daf-routing/builder-logging-packages.log" 2>&1
fi
SCRIPT
                else
                    cat > "${!#}" <<'SCRIPT'
set -euo pipefail
if [[ "${bootstrap_case}" == "after-start" ]]; then
    echo '{"event":"workflow_state","state":"starting"}' > "${bootstrap_test_root}/log/daf-routing/builder-events.log"
    echo 'later workflow error' >&2
    exit 73
fi
checksum="$(curl https://example.test/checksum)"
SCRIPT
                fi ;;
            'logs create-log-stream')
                [[ "$*" == *'--log-stream-name i-0123456789abcdef0/bootstrap'* ]] ;;
            'logs put-log-events')
                while [[ "$1" != "--log-events" ]]; do shift; done
                printf '%s\n' "$2" > "${bootstrap_test_root}/cloudwatch.json" ;;
            'sns publish') touch "${bootstrap_test_root}/alert" ;;
            *) return 90 ;;
        esac
    }
    export -f aws sha256sum shutdown systemctl

    # Run as an independent Bash process so the test does not suppress errexit.
    set +e
    bash "${bootstrap_test_root}/user-data.sh" > "${bootstrap_test_root}/console" 2>&1
    actual_exit=$?
    set -e

    [[ "${actual_exit}" == "${expected_exit}" ]]
    [[ -f "${bootstrap_test_root}/shutdown" && -f "${bootstrap_test_root}/alert" ]]
    if [[ "${bootstrap_case}" == "after-start" ]]; then
        [[ ! -e "${bootstrap_test_root}/cloudwatch.json" ]]
        return
    fi
    jq -e --arg scenario "${bootstrap_case}" --argjson exit_code "${expected_exit}" '
        .[0].message | fromjson |
        .event == "bootstrap_failed" and .exit_code == $exit_code and .line > 0 and
        (if $scenario == "download" then
            .phase == "download-logging" and (.command | contains("aws s3api head-object")) and
            (.output | contains("S3: service unavailable"))
        elif $scenario == "install" then
            .phase == "install-logging" and (.output | contains("command=dnf install")) and
            (.package_output | contains("dnf: package metadata unavailable"))
        else
            .phase == "workflow" and (.output | contains("command=curl https://example.test/checksum")) and
            (.output | contains("curl: snapshot checksum timed out"))
        end)
    ' "${bootstrap_test_root}/cloudwatch.json" >/dev/null || {
        jq -r '.[0].message' "${bootstrap_test_root}/cloudwatch.json" >&2
        return 1
    }
)

test_bootstrap_logging "${ROUTING_ONLY_USER_DATA}" 71 download
test_bootstrap_logging "${SCHEDULED_USER_DATA}" 72 install
test_bootstrap_logging "${SCHEDULED_USER_DATA}" 28 workflow
test_bootstrap_logging "${SCHEDULED_USER_DATA}" 73 after-start


grep -qF 'service=already-current' "${DEPLOY}"
grep -qF 'ERROR current release is not healthy' "${DEPLOY}"
grep -qF 'rm -rf "${STAGING_DIR}"' "${DEPLOY}"
grep -qF 'mv -Tf "${GRAPH_ROOT}/current.rollback" "${GRAPH_ROOT}/current"' "${DEPLOY}"
grep -qF 'grep -qF "${expected_value}" "${CONFIG_PATH}"' "${DEPLOY}"
grep -qF 'local_release_id}" != "${RELEASE_ID}" && "${local_release_id}" != "${PREVIOUS_TARGET}' "${DEPLOY}"

grep -qF 'default     = "rate(14 days)"' "${ROUTING_DIR}/schedule_variables.tf"
grep -qF 'default     = "2026-10-11T07:00:00Z"' "${ROUTING_DIR}/schedule_variables.tf"
grep -qF 'start_date                   = var.graph_build_schedule_start_date' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'default     = "America/Chicago"' "${ROUTING_DIR}/schedule_variables.tf"
grep -qF 'ClientToken = "<aws.scheduler.scheduled-time>"' "${ROUTING_DIR}/scheduler.tf"
grep -qF '}), "\\u003caws.scheduler.scheduled-time\\u003e", "<aws.scheduler.scheduled-time>")' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'Version          = "$Default"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'arn      = "arn:aws:scheduler:::aws-sdk:ec2:runInstances"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'maximum_retry_attempts       = 3' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'sqs_managed_sse_enabled   = true' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/DafRoutingWorkloadBoundary"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'graph_build_schedule_group_arn = "arn:aws:scheduler:${var.aws_region}:${var.aws_account_id}:schedule-group/default"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'values   = [local.graph_build_schedule_group_arn]' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'instance_initiated_shutdown_behavior = "terminate"' "${ROUTING_DIR}/compute.tf"
if grep -qF 'resource "aws_instance" "serving"' "${ROUTING_DIR}/compute.tf"; then
    echo "Retired persistent serving instance remains configured" >&2
    exit 1
fi
grep -qF 'volume_size           = 768' "${ROUTING_DIR}/compute.tf"
grep -qF 'delete_on_termination = true' "${ROUTING_DIR}/compute.tf"
grep -qF 'source_hash            = filesha256' "${ROUTING_DIR}/operations.tf"
grep -qF 'server_side_encryption = "AES256"' "${ROUTING_DIR}/operations.tf"

jq -e '.Statement[] | select(.Sid == "PassSchedulerRoleOnlyToScheduler")
    | .Resource == "arn:aws:iam::326364278889:role/daf-routing-graph-build-scheduler"
    and .Condition.StringEquals["iam:PassedToService"] == "scheduler.amazonaws.com"' \
    "${SCHEDULER_OPERATOR_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "ManageRoutingSchedules")
    | .Resource == "arn:aws:scheduler:us-east-1:326364278889:schedule/default/daf-routing-weekly-graph-build"' \
    "${SCHEDULER_OPERATOR_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "ManageRoutingSchedulerDlq")
    | (.Action | index("sqs:ReceiveMessage")) != null
    and .Resource == "arn:aws:sqs:us-east-1:326364278889:daf-routing-graph-build-scheduler-dlq"' \
    "${SCHEDULER_OPERATOR_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "ManageRoutingOperationObjectTags")
    | (.Action | sort) == ["s3:GetObjectTagging", "s3:PutObjectTagging"]
    and .Resource == "arn:aws:s3:::daf-routing-graphs-326364278889-us-east-1/operations/*"' \
    "${SCHEDULER_OPERATOR_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "ManageRoutingAlarms")
    | .Resource == "arn:aws:cloudwatch:us-east-1:326364278889:alarm:daf-infrastructure-routing-*"' \
    "${ROUTING_SERVICES_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "LaunchReviewedBuilderTemplate")
    | .Condition.Bool["ec2:IsLaunchTemplateResource"] == "true"' \
    "${IAM_DIR}/daf-routing-workload-boundary.json" >/dev/null
jq -e '.Statement[] | select(.Sid == "RunReviewedServingOperation")
    | (.Resource | index("arn:aws:ec2:us-east-1:326364278889:instance/i-096fe74bac4f594b3")) != null
    and (.Resource | index("arn:aws:ec2:us-east-1:326364278889:instance/i-048e46c69284d112a")) == null' \
    "${IAM_DIR}/daf-routing-workload-boundary.json" >/dev/null

status_output="$({
    aws() {
        local arguments="$*"

        if [[ "${arguments}" == *operations/active-build.json* ]]; then
            printf '%s\n' '{"release_id":"20260823T070000Z-us-v1","pbf_name":"us-260818.osm.pbf","instance_id":"i-0123456789abcdef0","command_id":"","mode":"scheduled","status":"deployed","detail":"serving-healthy","started_at":"2026-08-23T07:00:00Z"}'
        elif [[ "${arguments}" == *describe-instances* ]]; then
            echo terminated
        elif [[ "${arguments}" == *operations/builds/*/status.json* ]]; then
            printf '%s\n' '{"percent":100,"phase":"complete","detail":"artifact-uploaded","resources":{}}'
        elif [[ "${arguments}" == *head-object* ]]; then
            return 0
        else
            return 1
        fi
    }
    set --
    source "${STATUS}"
})"
grep -qF 'Mode:     scheduled' <<< "${status_output}"
grep -qF 'Status:   deployed (serving-healthy)' <<< "${status_output}"

if rg -n 'echo .*\b(latitude|longitude|coordinates|service[_ -]?token|decrypted)' \
    "${WORKFLOW}" "${DEPLOY}" "${SCHEDULED_USER_DATA}"; then
    echo "Scheduled operation output includes a protected field" >&2
    exit 1
fi

echo "scheduled-builder-tests: PASS"
