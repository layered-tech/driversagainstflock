#!/usr/bin/env bash

set -euo pipefail

export AWS_PAGER=""

readonly AWS_ACCOUNT_ID="326364278889"
readonly AWS_PROFILE="daf-routing"
readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-${AWS_ACCOUNT_ID}-${AWS_REGION}"
readonly BUILD_SCRIPT_VERSION="v1.3.0"
readonly WORKFLOW_SCRIPT_VERSION="v1.0.0"
readonly LOGGING_SCRIPT_VERSION="v1.0.0"
readonly STATUS_INTERVAL_SECONDS=15
readonly OPERATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BUILD_SCRIPT_PATH="${OPERATIONS_DIR}/build/${BUILD_SCRIPT_VERSION}/build-initial-graph.sh"
readonly WORKFLOW_SCRIPT_PATH="${OPERATIONS_DIR}/scheduled-builder/${WORKFLOW_SCRIPT_VERSION}/run-build.sh"
readonly LOGGING_SCRIPT_PATH="${OPERATIONS_DIR}/logging/${LOGGING_SCRIPT_VERSION}/install-cloudwatch-logs.sh"
readonly BUILDER_USER_DATA_PATH="${OPERATIONS_DIR}/builder-user-data.sh"
readonly WORKFLOW_SCRIPT_KEY="operations/scheduled-builder/${WORKFLOW_SCRIPT_VERSION}/run-build.sh"
readonly LOGGING_SCRIPT_KEY="operations/logging/${LOGGING_SCRIPT_VERSION}/install-cloudwatch-logs.sh"
readonly GEOFABRIK_INDEX_URL="https://download.geofabrik.de/north-america/"

ASSUME_YES=false
DRY_RUN=false
DETACH_AFTER_HANDOFF=false
PBF_NAME=""
PBF_MD5=""
RELEASE_ID=""
INSTANCE_ID=""
COMMAND_ID=""
BUILD_COMPLETED=false
TERMINAL_DETACHED=false

usage() {
    cat <<'USAGE'
Usage: npm run graph:build -- [options]

Build a fresh U.S. GraphHopper road graph using the private AWS builder.

Options:
  --yes                 Skip the cost confirmation.
  --detach              Return after AWS accepts the build.
  --dry-run             Show the resolved build without touching AWS.
  --release-id ID       Override the generated release ID.
  --pbf-name NAME       Use a specific dated Geofabrik U.S. PBF.
  --pbf-md5 MD5         Expected checksum for --pbf-name.
  --help                Show this help.
USAGE
}

fail() {
    echo "ERROR $*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

cleanup() {
    local exit_code=$?

    trap - EXIT
    if (( exit_code != 0 )) && [[ -n "${INSTANCE_ID}" ]] && declare -F publish_build_state >/dev/null; then
        publish_build_state build_failed "${COMMAND_ID}" || true
    fi

    if [[ -n "${INSTANCE_ID}" && !( "${TERMINAL_DETACHED}" == "true" && -n "${COMMAND_ID}" ) ]]; then
        echo "Cleaning up temporary builder ${INSTANCE_ID}..."

        if aws ec2 terminate-instances \
            --profile "${AWS_PROFILE}" \
            --region "${AWS_REGION}" \
            --instance-ids "${INSTANCE_ID}" \
            --output json >/dev/null; then
            if ! aws ec2 wait instance-terminated \
                --profile "${AWS_PROFILE}" \
                --region "${AWS_REGION}" \
                --instance-ids "${INSTANCE_ID}"; then
                echo "ERROR timed out waiting for builder termination" >&2
                exit_code=1
            fi
        else
            echo "ERROR failed to terminate temporary builder ${INSTANCE_ID}" >&2
            exit_code=1
        fi
    fi

    if [[ "${BUILD_COMPLETED}" == "true" && "${exit_code}" -eq 0 ]]; then
        echo "Graph build complete: releases/${RELEASE_ID}"
        echo "The graph was built but not deployed."
    fi

    exit "${exit_code}"
}

handle_hangup() {
    TERMINAL_DETACHED=true
    exit 0
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap handle_hangup HUP

while (( $# > 0 )); do
    case "$1" in
        --yes)
            ASSUME_YES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --detach)
            DETACH_AFTER_HANDOFF=true
            shift
            ;;
        --release-id)
            RELEASE_ID="${2:-}"
            shift 2
            ;;
        --pbf-name)
            PBF_NAME="${2:-}"
            shift 2
            ;;
        --pbf-md5)
            PBF_MD5="${2:-}"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            fail "unknown argument: $1"
            ;;
    esac
done

require_command awk
require_command curl
require_command grep
require_command jq
require_command shasum
require_command sort

[[ -f "${BUILD_SCRIPT_PATH}" ]] || fail "build script not found: ${BUILD_SCRIPT_PATH}"
[[ -f "${WORKFLOW_SCRIPT_PATH}" ]] || fail "workflow script not found: ${WORKFLOW_SCRIPT_PATH}"
[[ -f "${LOGGING_SCRIPT_PATH}" ]] || fail "logging script not found: ${LOGGING_SCRIPT_PATH}"
[[ -f "${BUILDER_USER_DATA_PATH}" ]] || fail "builder user data not found: ${BUILDER_USER_DATA_PATH}"

if [[ -n "${PBF_NAME}" || -n "${PBF_MD5}" ]]; then
    [[ -n "${PBF_NAME}" && -n "${PBF_MD5}" ]] || fail "--pbf-name and --pbf-md5 must be provided together"
else
    echo "Finding the newest immutable U.S. snapshot from Geofabrik..."
    index_html="$(curl --fail --location --silent --show-error "${GEOFABRIK_INDEX_URL}")"
    PBF_NAME="$(printf '%s' "${index_html}" | grep -Eo 'us-[0-9]{6}\.osm\.pbf\.md5' | sort -u | tail -n 1 | sed 's/\.md5$//')"
    [[ -n "${PBF_NAME}" ]] || fail "could not identify the newest dated U.S. PBF"

    checksum_line="$(curl --fail --location --silent --show-error "${GEOFABRIK_INDEX_URL}${PBF_NAME}.md5")"
    PBF_MD5="$(printf '%s\n' "${checksum_line}" | awk '{print tolower($1)}')"
fi

[[ "${PBF_NAME}" =~ ^us-[0-9]{6}\.osm\.pbf$ ]] || fail "invalid dated U.S. PBF name: ${PBF_NAME}"
[[ "${PBF_MD5}" =~ ^[0-9a-f]{32}$ ]] || fail "invalid PBF checksum"

if [[ -z "${RELEASE_ID}" ]]; then
    RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-us-v1"
fi

[[ "${RELEASE_ID}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || fail "invalid release ID: ${RELEASE_ID}"

readonly PBF_NAME
readonly PBF_MD5
readonly RELEASE_ID
readonly BUILD_SCRIPT_SHA="$(shasum -a 256 "${BUILD_SCRIPT_PATH}" | awk '{print $1}')"
readonly WORKFLOW_SCRIPT_SHA="$(shasum -a 256 "${WORKFLOW_SCRIPT_PATH}" | awk '{print $1}')"
readonly LOGGING_SCRIPT_SHA="$(shasum -a 256 "${LOGGING_SCRIPT_PATH}" | awk '{print $1}')"
readonly BUILD_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo
echo "Graph release: ${RELEASE_ID}"
echo "Road snapshot: ${PBF_NAME}"
echo "Builder:       temporary r8g.4xlarge with encrypted 768-GiB scratch"
echo "Deployment:    not included"
echo

if [[ "${DRY_RUN}" == "true" ]]; then
    echo "Dry run complete; AWS was not contacted."
    exit 0
fi

require_command aws

publish_build_state() {
    local launcher_status="$1"
    local command_id="${2:-}"
    local existing_json="{}"
    local state_json

    existing_json="$(aws s3 cp \
        "s3://${ARTIFACT_BUCKET}/operations/active-build.json" - \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --no-progress 2>/dev/null || printf '{}')"

    if ! jq -e 'type == "object"' <<< "${existing_json}" >/dev/null 2>&1; then
        existing_json="{}"
    fi

    state_json="$(jq -nc \
        --argjson existing "${existing_json}" \
        --arg release_id "${RELEASE_ID}" \
        --arg pbf_name "${PBF_NAME}" \
        --arg pbf_md5 "${PBF_MD5}" \
        --arg instance_id "${INSTANCE_ID}" \
        --arg command_id "${command_id}" \
        --arg launcher_status "${launcher_status}" \
        --arg started_at "${BUILD_STARTED_AT}" \
        '($existing | if .release_id == $release_id then . else {} end) as $base
        | ($launcher_status == "running" and (["built", "build_failed", "deployment_pending", "deployment_failed", "deployed"] | index($base.status)) != null) as $preserve_terminal
        | $base + {
            release_id: $release_id,
            pbf_name: $pbf_name,
            pbf_md5: $pbf_md5,
            instance_id: $instance_id,
            command_id: (if $command_id == "" then ($base.command_id // "") else $command_id end),
            mode: "manual",
            status: (if $preserve_terminal then $base.status else $launcher_status end),
            launcher_status: (if $preserve_terminal then ($base.launcher_status // $base.status) else $launcher_status end),
            started_at: ($base.started_at // $started_at)
        }')"

    printf '%s\n' "${state_json}" | aws s3 cp - \
        "s3://${ARTIFACT_BUCKET}/operations/active-build.json" \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --sse AES256 \
        --content-type application/json \
        --no-progress
}

if [[ "${ASSUME_YES}" != "true" ]]; then
    read -r -p "Launch this billable temporary builder? [y/N] " confirmation
    [[ "${confirmation}" =~ ^[Yy]$ ]] || fail "build cancelled"
fi

caller_account="$(aws sts get-caller-identity \
    --profile "${AWS_PROFILE}" \
    --query Account \
    --output text)"
[[ "${caller_account}" == "${AWS_ACCOUNT_ID}" ]] || fail "AWS profile resolved to unexpected account ${caller_account}"

existing_builders="$(aws ec2 describe-instances \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --filters \
        Name=tag:Name,Values=daf-routing-builder \
        Name=instance-state-name,Values=pending,running,stopping,stopped \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text)"
[[ -z "${existing_builders}" ]] || fail "another builder already exists: ${existing_builders}"

echo "Publishing checksum-pinned build operation ${BUILD_SCRIPT_VERSION}..."
aws s3api put-object \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "operations/build/${BUILD_SCRIPT_VERSION}/build-initial-graph.sh" \
    --body "${BUILD_SCRIPT_PATH}" \
    --server-side-encryption AES256 \
    --metadata "sha256=${BUILD_SCRIPT_SHA}" \
    --output json >/dev/null

echo "Publishing shared build workflow ${WORKFLOW_SCRIPT_VERSION}..."
aws s3api put-object \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "${WORKFLOW_SCRIPT_KEY}" \
    --body "${WORKFLOW_SCRIPT_PATH}" \
    --server-side-encryption AES256 \
    --metadata "sha256=${WORKFLOW_SCRIPT_SHA}" \
    --output json >/dev/null

echo "Publishing checksum-pinned logging operation ${LOGGING_SCRIPT_VERSION}..."
aws s3api put-object \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "${LOGGING_SCRIPT_KEY}" \
    --body "${LOGGING_SCRIPT_PATH}" \
    --server-side-encryption AES256 \
    --metadata "sha256=${LOGGING_SCRIPT_SHA}" \
    --output json >/dev/null

echo "Launching temporary builder..."
INSTANCE_ID="$(aws ec2 run-instances \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --launch-template LaunchTemplateName=daf-routing-builder \
    --count 1 \
    --client-token "daf-routing-${RELEASE_ID}" \
    --instance-initiated-shutdown-behavior terminate \
    --user-data "$(< "${BUILDER_USER_DATA_PATH}")" \
    --block-device-mappings '[{"DeviceName":"/dev/sdf","Ebs":{"DeleteOnTermination":true,"Encrypted":true,"VolumeSize":768,"VolumeType":"gp3","Iops":3000,"Throughput":250}}]' \
    --tag-specifications \
        'ResourceType=instance,Tags=[{Key=Name,Value=daf-routing-builder},{Key=Project,Value=daf-routing},{Key=Environment,Value=production},{Key=ManagedBy,Value=terraform}]' \
        'ResourceType=volume,Tags=[{Key=Name,Value=daf-routing-builder-temporary},{Key=Project,Value=daf-routing},{Key=Environment,Value=production},{Key=ManagedBy,Value=terraform}]' \
    --query 'Instances[0].InstanceId' \
    --output text)"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]] || fail "AWS returned an invalid builder instance ID"
publish_build_state starting

echo "Waiting for ${INSTANCE_ID} to start..."
aws ec2 wait instance-running \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --instance-ids "${INSTANCE_ID}"

SCRATCH_VOLUME_ID=""

for _ in $(seq 1 60); do
    SCRATCH_VOLUME_ID="$(aws ec2 describe-volumes \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --filters \
            "Name=attachment.instance-id,Values=${INSTANCE_ID}" \
            Name=attachment.device,Values=/dev/sdf \
        --query 'Volumes[0].VolumeId' \
        --output text)"

    if [[ "${SCRATCH_VOLUME_ID}" =~ ^vol-[0-9a-f]{17}$ ]]; then
        break
    fi

    sleep 5
done

[[ "${SCRATCH_VOLUME_ID}" =~ ^vol-[0-9a-f]{17}$ ]] || fail "scratch volume did not attach"
readonly SCRATCH_VOLUME_ID

echo "Waiting for private SSM access..."
ssm_status=""

for _ in $(seq 1 120); do
    ssm_status="$(aws ssm describe-instance-information \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
        --query 'InstanceInformationList[0].PingStatus' \
        --output text)"

    [[ "${ssm_status}" == "Online" ]] && break
    sleep 5
done

[[ "${ssm_status}" == "Online" ]] || fail "builder did not become available through SSM"

parameters_json="$(jq -nc \
    --arg workflow_key "${WORKFLOW_SCRIPT_KEY}" \
    --arg workflow_sha "${WORKFLOW_SCRIPT_SHA}" \
    --arg instance_id "${INSTANCE_ID}" \
    --arg scratch_volume_id "${SCRATCH_VOLUME_ID}" \
    --arg release_id "${RELEASE_ID}" \
    --arg pbf_name "${PBF_NAME}" \
    --arg pbf_md5 "${PBF_MD5}" \
    '{
        executionTimeout: ["43200"],
        commands: [
            "set -euo pipefail",
            "trap '\''shutdown -h +1'\'' EXIT",
            "while [[ ! -f /var/lib/cloud/instance/boot-finished ]]; do sleep 2; done",
            "systemctl is-active --quiet amazon-cloudwatch-agent",
            "systemctl is-active --quiet daf-routing-builder-expiry.timer",
            "readonly SCRIPT=/var/lib/daf-routing-build/run-build.sh",
            "aws s3 cp --region us-east-1 --no-progress s3://daf-routing-graphs-326364278889-us-east-1/" + $workflow_key + " $SCRIPT",
            "printf \"" + $workflow_sha + "  %s\\n\" \"$SCRIPT\" | sha256sum --check --status",
            "chmod 0700 \"$SCRIPT\"",
            "bash \"$SCRIPT\" --mode manual --instance-id " + $instance_id + " --scratch-volume-id " + $scratch_volume_id + " --release-id " + $release_id + " --pbf-name " + $pbf_name + " --pbf-md5 " + $pbf_md5
        ]
    }')"

echo "Starting graph import, preparation, validation, and upload..."
COMMAND_ID="$(aws ssm send-command \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --document-name AWS-RunShellScript \
    --timeout-seconds 60 \
    --parameters "${parameters_json}" \
    --query Command.CommandId \
    --output text)"
[[ "${COMMAND_ID}" =~ ^[0-9a-f-]{36}$ ]] || fail "AWS returned an invalid SSM command ID"
readonly COMMAND_ID
publish_build_state running "${COMMAND_ID}"
echo "You can safely close this terminal. Check later with: npm run graph:status"

if [[ "${DETACH_AFTER_HANDOFF}" == "true" ]]; then
    TERMINAL_DETACHED=true
    echo "Detached. The AWS build will continue independently."
    exit 0
fi

while true; do
    command_status="$(aws ssm get-command-invocation \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --command-id "${COMMAND_ID}" \
        --instance-id "${INSTANCE_ID}" \
        --query Status \
        --output text 2>/dev/null || true)"

    status_json="$(aws s3 cp \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        "s3://${ARTIFACT_BUCKET}/operations/builds/${RELEASE_ID}/status.json" - \
        2>/dev/null || true)"

    if [[ -n "${status_json}" ]]; then
        printf 'Build: %s%% — %s (%s)\n' \
            "$(jq -r '.percent' <<< "${status_json}")" \
            "$(jq -r '.phase' <<< "${status_json}")" \
            "$(jq -r '.detail' <<< "${status_json}")"
    else
        echo "Build command: ${command_status:-Pending}"
    fi

    case "${command_status}" in
        Success)
            break
            ;;
        Cancelled|Cancelling|Failed|TimedOut)
            aws ssm get-command-invocation \
                --profile "${AWS_PROFILE}" \
                --region "${AWS_REGION}" \
                --command-id "${COMMAND_ID}" \
                --instance-id "${INSTANCE_ID}" \
                --query '{Status:Status,Error:StandardErrorContent}' \
                --output json >&2
            fail "graph build ended with status ${command_status}"
            ;;
    esac

    sleep "${STATUS_INTERVAL_SECONDS}"
done

build_output="$(aws ssm get-command-invocation \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --query StandardOutputContent \
    --output text)"
grep -qF "BUILD_OK operation=1.3.0 release=${RELEASE_ID}" <<< "${build_output}" || fail "build command succeeded without the expected completion marker"

manifest_json="$(aws s3 cp \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    "s3://${ARTIFACT_BUCKET}/releases/${RELEASE_ID}/manifest.json" -)"

jq -e \
    --arg release_id "${RELEASE_ID}" \
    --arg pbf_name "${PBF_NAME}" \
    --arg pbf_md5 "${PBF_MD5}" \
    '.release_id == $release_id and .source.name == $pbf_name and .source.md5 == $pbf_md5 and .archive.size_bytes > 0' \
    <<< "${manifest_json}" >/dev/null || fail "uploaded manifest did not match the requested build"

BUILD_COMPLETED=true
