#!/usr/bin/env bash

set -euo pipefail

readonly OPERATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROUTING_DIR="${OPERATIONS_DIR}/.."
readonly IAM_DIR="${ROUTING_DIR}/../iam"
readonly WORKFLOW="${OPERATIONS_DIR}/scheduled-builder/v1.0.0/run-build.sh"
readonly BUILD="${OPERATIONS_DIR}/build/v1.3.0/build-initial-graph.sh"
readonly SCHEDULED_USER_DATA="${OPERATIONS_DIR}/scheduled-builder-user-data.sh"
readonly DEPLOY="${OPERATIONS_DIR}/serving/v1.1.0/deploy-graph.sh"
readonly STATUS="${OPERATIONS_DIR}/graph-status.sh"
readonly SCHEDULER_OPERATOR_POLICY="${IAM_DIR}/daf-routing-graph-build-scheduler-operator-policy.json"
readonly BUILD_SHA256="$(shasum -a 256 "${BUILD}" | awk '{print $1}')"
readonly DEPLOY_SHA256="$(shasum -a 256 "${DEPLOY}" | awk '{print $1}')"
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
grep -qF 'dnf install -y jq' "${SCHEDULED_USER_DATA}"
grep -qF 'bash "${BOOTSTRAP_PATH}" --mode scheduled' "${SCHEDULED_USER_DATA}"

if grep -Eq 'dnf install.*[[:space:]]curl([[:space:]]|$)' "${SCHEDULED_USER_DATA}"; then
    echo "Scheduled bootstrap must keep the Amazon Linux curl-minimal package" >&2
    exit 1
fi


grep -qF 'service=already-current' "${DEPLOY}"
grep -qF 'ERROR current release is not healthy' "${DEPLOY}"
grep -qF 'rm -rf "${STAGING_DIR}"' "${DEPLOY}"
grep -qF 'mv -Tf "${GRAPH_ROOT}/current.rollback" "${GRAPH_ROOT}/current"' "${DEPLOY}"
grep -qF 'grep -qF "${expected_value}" "${CONFIG_PATH}"' "${DEPLOY}"
grep -qF 'local_release_id}" != "${RELEASE_ID}" && "${local_release_id}" != "${PREVIOUS_TARGET}' "${DEPLOY}"

grep -qF 'default     = "cron(0 2 ? * SUN *)"' "${ROUTING_DIR}/schedule_variables.tf"
grep -qF 'default     = "America/Chicago"' "${ROUTING_DIR}/schedule_variables.tf"
grep -qF 'ClientToken = "<aws.scheduler.scheduled-time>"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'Version          = "$Default"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'arn      = "arn:aws:scheduler:::aws-sdk:ec2:runInstances"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'maximum_retry_attempts       = 3' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'sqs_managed_sse_enabled   = true' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/DafRoutingWorkloadBoundary"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'graph_build_schedule_group_arn = "arn:aws:scheduler:${var.aws_region}:${var.aws_account_id}:schedule-group/default"' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'values   = [local.graph_build_schedule_group_arn]' "${ROUTING_DIR}/scheduler.tf"
grep -qF 'instance_initiated_shutdown_behavior = "terminate"' "${ROUTING_DIR}/compute.tf"
grep -qF 'ignore_changes = [ami]' "${ROUTING_DIR}/compute.tf"
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
    | .Resource == "arn:aws:sqs:us-east-1:326364278889:daf-routing-graph-build-scheduler-dlq"' \
    "${SCHEDULER_OPERATOR_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "ManageRoutingOperationObjectTags")
    | (.Action | sort) == ["s3:GetObjectTagging", "s3:PutObjectTagging"]
    and .Resource == "arn:aws:s3:::daf-routing-graphs-326364278889-us-east-1/operations/*"' \
    "${SCHEDULER_OPERATOR_POLICY}" >/dev/null
jq -e '.Statement[] | select(.Sid == "LaunchReviewedBuilderTemplate")
    | .Condition.Bool["ec2:IsLaunchTemplateResource"] == "true"' \
    "${IAM_DIR}/daf-routing-workload-boundary.json" >/dev/null
jq -e '.Statement[] | select(.Sid == "RunReviewedServingOperation")
    | (.Resource | index("arn:aws:ec2:us-east-1:326364278889:instance/i-048e46c69284d112a")) != null' \
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
