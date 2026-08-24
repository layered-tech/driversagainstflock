#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.0"
readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly ALERTS_TOPIC_ARN="arn:aws:sns:us-east-1:326364278889:daf-routing-alerts"
readonly SERVING_INSTANCE_ID="i-048e46c69284d112a"
readonly ACTIVE_BUILD_KEY="operations/active-build.json"
readonly BUILD_SCRIPT_VERSION="v1.3.0"
readonly DEPLOY_SCRIPT_VERSION="v1.1.0"
readonly BUILD_SCRIPT_KEY="operations/build/${BUILD_SCRIPT_VERSION}/build-initial-graph.sh"
readonly DEPLOY_SCRIPT_KEY="operations/serving/${DEPLOY_SCRIPT_VERSION}/deploy-graph.sh"
readonly BUILD_SCRIPT_SHA256="2db8a26abb7d7a2b998a1dede77c23b7951f2c23e1bd1e26f17b9d1f9f98e7c8"
readonly DEPLOY_SCRIPT_SHA256="dcdb2f0c49383b9a4f21c03896c4c700a9b7879167d882575a71767a382fcd25"
readonly GEOFABRIK_INDEX_URL="https://download.geofabrik.de/north-america/"
readonly OPERATION_ROOT="/var/lib/daf-routing-build/operations"
readonly CLOUDWATCH_EVENT_LOG="/var/log/daf-routing/builder-events.log"

MODE="scheduled"
DRY_RUN=false
PBF_NAME=""
PBF_MD5=""
RELEASE_ID=""
SCRATCH_VOLUME_ID=""
INSTANCE_ID=""
DEPLOY_COMMAND_ID=""
CURRENT_STAGE="setup"
FINAL_STATE_WRITTEN=false
FAILURE_NOTIFIED=false
STATE_STARTED=false
readonly STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

usage() {
    cat <<'USAGE'
Usage: run-build.sh [options]

Run a manual or scheduled GraphHopper build through the same terminal-state workflow.

Options:
  --mode MODE                 manual or scheduled (default: scheduled)
  --dry-run                   Validate and print the resolved workflow without AWS calls
  --release-id ID             Release override for manual runs and dry runs
  --pbf-name NAME             Dated Geofabrik U.S. PBF override
  --pbf-md5 MD5               Expected checksum for --pbf-name
  --scratch-volume-id ID      Exact temporary scratch volume
  --instance-id ID            Builder instance ID supplied by the manual launcher
  --help                      Show this help
USAGE
}

fail() {
    echo "ERROR $*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

is_terminal_state() {
    case "$1" in
        built|build_failed|deployment_pending|deployment_failed|deployed)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

write_cloudwatch_event() {
    local state="$1"
    local detail="$2"

    [[ -f "${CLOUDWATCH_EVENT_LOG}" ]] || return 0
    [[ "${state}" =~ ^[a-z_]+$ && "${detail}" =~ ^[a-z0-9-]+$ ]] || return 0

    printf '{"timestamp":"%s","event":"workflow_state","role":"builder","release_id":"%s","mode":"%s","state":"%s","detail":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${RELEASE_ID}" "${MODE}" "${state}" "${detail}" >> "${CLOUDWATCH_EVENT_LOG}" || true
}

publish_state() {
    local state="$1"
    local detail="$2"
    local existing_json="{}"
    local finished_at=""
    local state_path="${OPERATION_ROOT}/active-build.json"

    write_cloudwatch_event "${state}" "${detail}"

    if is_terminal_state "${state}"; then
        finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi

    existing_json="$(aws s3 cp \
        --region "${AWS_REGION}" \
        --no-progress \
        "s3://${ARTIFACT_BUCKET}/${ACTIVE_BUILD_KEY}" - 2>/dev/null || printf '{}')"

    if ! jq -e 'type == "object"' <<< "${existing_json}" >/dev/null 2>&1; then
        existing_json="{}"
    fi

    jq -n \
        --argjson existing "${existing_json}" \
        --arg release_id "${RELEASE_ID}" \
        --arg pbf_name "${PBF_NAME}" \
        --arg pbf_md5 "${PBF_MD5}" \
        --arg instance_id "${INSTANCE_ID}" \
        --arg mode "${MODE}" \
        --arg state "${state}" \
        --arg detail "${detail}" \
        --arg started_at "${STARTED_AT}" \
        --arg finished_at "${finished_at}" \
        --arg deployment_command_id "${DEPLOY_COMMAND_ID}" \
        '($existing | if .release_id == $release_id then . else {} end) + {
            release_id: $release_id,
            pbf_name: $pbf_name,
            pbf_md5: $pbf_md5,
            instance_id: $instance_id,
            mode: $mode,
            status: $state,
            launcher_status: $state,
            detail: $detail,
            started_at: (.started_at // $started_at)
        }
        + (if $finished_at == "" then {finished_at: null} else {finished_at: $finished_at} end)
        + (if $deployment_command_id == "" then {} else {deployment_command_id: $deployment_command_id} end)' \
        > "${state_path}"

    aws s3 cp \
        --region "${AWS_REGION}" \
        --no-progress \
        --sse AES256 \
        --content-type application/json \
        "${state_path}" "s3://${ARTIFACT_BUCKET}/${ACTIVE_BUILD_KEY}" >/dev/null
}

notify_failure() {
    local state="$1"
    local detail="$2"

    aws sns publish \
        --region "${AWS_REGION}" \
        --topic-arn "${ALERTS_TOPIC_ARN}" \
        --subject "DAF routing graph automation failure" \
        --message "Graph release ${RELEASE_ID} ended as ${state}: ${detail}." \
        --output json >/dev/null
    FAILURE_NOTIFIED=true
}

finish() {
    local exit_code=$?
    local failure_state="build_failed"
    local failure_detail="build-operation-exit-${exit_code}"

    trap - EXIT

    if (( exit_code != 0 )) && [[ "${STATE_STARTED}" == "true" && "${FINAL_STATE_WRITTEN}" != "true" ]]; then
        if [[ "${CURRENT_STAGE}" == "deployment" ]]; then
            failure_state="deployment_failed"
            failure_detail="deployment-operation-exit-${exit_code}"
        fi

        publish_state "${failure_state}" "${failure_detail}" || true

        if [[ "${FAILURE_NOTIFIED}" != "true" ]]; then
            notify_failure "${failure_state}" "${failure_detail}" || true
        fi
    fi

    exit "${exit_code}"
}

trap finish EXIT

while (( $# > 0 )); do
    case "$1" in
        --mode)
            MODE="${2:-}"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
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
        --scratch-volume-id)
            SCRATCH_VOLUME_ID="${2:-}"
            shift 2
            ;;
        --instance-id)
            INSTANCE_ID="${2:-}"
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

[[ "${MODE}" == "manual" || "${MODE}" == "scheduled" ]] || fail "mode must be manual or scheduled"

require_command awk
require_command aws
require_command curl
require_command grep
require_command jq
require_command sed
require_command sha256sum
require_command sort

if [[ -n "${PBF_NAME}" || -n "${PBF_MD5}" ]]; then
    [[ -n "${PBF_NAME}" && -n "${PBF_MD5}" ]] || fail "PBF name and checksum must be provided together"
else
    [[ "${MODE}" == "scheduled" ]] || fail "manual builds require a PBF name and checksum"
    index_html="$(curl --fail --location --silent --show-error "${GEOFABRIK_INDEX_URL}")"
    PBF_NAME="$(printf '%s' "${index_html}" | grep -Eo 'us-[0-9]{6}\.osm\.pbf\.md5' | sort -u | tail -n 1 | sed 's/\.md5$//')"
    [[ -n "${PBF_NAME}" ]] || fail "could not identify the newest dated U.S. PBF"
    checksum_line="$(curl --fail --location --silent --show-error "${GEOFABRIK_INDEX_URL}${PBF_NAME}.md5")"
    PBF_MD5="$(printf '%s\n' "${checksum_line}" | awk '{print tolower($1)}')"
fi

[[ "${PBF_NAME}" =~ ^us-[0-9]{6}\.osm\.pbf$ ]] || fail "invalid dated U.S. PBF name"
[[ "${PBF_MD5}" =~ ^[0-9a-f]{32}$ ]] || fail "invalid PBF checksum"

if [[ -z "${RELEASE_ID}" ]]; then
    RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-us-v1"
fi

[[ "${RELEASE_ID}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || fail "invalid release ID"

resolve_scratch_volume_id() {
    local candidate
    local candidate_size
    local root_parent
    local root_source
    local serial
    local -a candidates=()

    require_command findmnt
    require_command lsblk

    root_source="$(findmnt -nro SOURCE /)"
    root_parent="/dev/$(lsblk -ndo PKNAME "${root_source}")"

    for candidate in /dev/nvme*n1; do
        [[ -b "${candidate}" ]] || continue
        [[ "${candidate}" != "${root_source}" && "${candidate}" != "${root_parent}" ]] || continue
        candidate_size="$(lsblk -bdno SIZE "${candidate}")"
        [[ "${candidate_size}" =~ ^[0-9]+$ ]] || continue
        (( candidate_size >= 700 * 1024 * 1024 * 1024 )) || continue
        serial="$(lsblk -ndo SERIAL "${candidate}" | tr -d '[:space:]-')"
        [[ "${serial}" =~ ^vol[0-9a-f]{17}$ ]] || continue
        candidates+=("${serial:0:3}-${serial:3}")
    done

    (( ${#candidates[@]} == 1 )) || fail "expected exactly one non-root scratch volume"
    printf '%s\n' "${candidates[0]}"
}

if [[ -z "${SCRATCH_VOLUME_ID}" && "${DRY_RUN}" != "true" ]]; then
    SCRATCH_VOLUME_ID="$(resolve_scratch_volume_id)"
fi

if [[ "${DRY_RUN}" == "true" && -z "${SCRATCH_VOLUME_ID}" ]]; then
    SCRATCH_VOLUME_ID="vol-00000000000000000"
fi

[[ "${SCRATCH_VOLUME_ID}" =~ ^vol-[0-9a-f]{17}$ ]] || fail "invalid scratch volume ID"

if [[ -z "${INSTANCE_ID}" && "${DRY_RUN}" != "true" ]]; then
    imds_token="$(curl --fail --silent --show-error \
        --request PUT \
        --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
        http://169.254.169.254/latest/api/token)"
    INSTANCE_ID="$(curl --fail --silent --show-error \
        --header "X-aws-ec2-metadata-token: ${imds_token}" \
        http://169.254.169.254/latest/meta-data/instance-id)"
fi

if [[ "${DRY_RUN}" == "true" && -z "${INSTANCE_ID}" ]]; then
    INSTANCE_ID="i-00000000000000000"
fi

[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]] || fail "invalid builder instance ID"

readonly MODE
readonly PBF_NAME
readonly PBF_MD5
readonly RELEASE_ID
readonly SCRATCH_VOLUME_ID
readonly INSTANCE_ID

if [[ "${DRY_RUN}" == "true" ]]; then
    printf 'Mode: %s\nRelease: %s\nSnapshot: %s\nScratch: exact non-root volume\nDeployment: %s\n' \
        "${MODE}" \
        "${RELEASE_ID}" \
        "${PBF_NAME}" \
        "$([[ "${MODE}" == "scheduled" ]] && printf automatic || printf deferred)"
    echo "Dry run complete; AWS was not contacted."
    FINAL_STATE_WRITTEN=true
    exit 0
fi

install -d -m 0700 "${OPERATION_ROOT}"
STATE_STARTED=true
publish_state starting operations-download

download_operation() {
    local key="$1"
    local destination="$2"
    local object_sha
    local reviewed_sha="$3"

    object_sha="$(aws s3api head-object \
        --region "${AWS_REGION}" \
        --bucket "${ARTIFACT_BUCKET}" \
        --key "${key}" \
        --query 'Metadata.sha256' \
        --output text)"
    [[ "${reviewed_sha}" =~ ^[0-9a-f]{64}$ ]] || fail "reviewed operation hash is invalid"
    [[ "${object_sha}" == "${reviewed_sha}" ]] || fail "operation object does not match its reviewed hash"
    aws s3 cp \
        --region "${AWS_REGION}" \
        --no-progress \
        "s3://${ARTIFACT_BUCKET}/${key}" "${destination}"
    printf '%s  %s\n' "${reviewed_sha}" "${destination}" | sha256sum --check --status
    chmod 0700 "${destination}"
}

readonly BUILD_SCRIPT_PATH="${OPERATION_ROOT}/build-initial-graph.sh"
download_operation "${BUILD_SCRIPT_KEY}" "${BUILD_SCRIPT_PATH}" "${BUILD_SCRIPT_SHA256}"

publish_state building build-started
CURRENT_STAGE="build"

bash "${BUILD_SCRIPT_PATH}" \
    --scratch-volume-id "${SCRATCH_VOLUME_ID}" \
    --release-id "${RELEASE_ID}" \
    --pbf-name "${PBF_NAME}" \
    --pbf-md5 "${PBF_MD5}"

manifest_json="$(aws s3 cp \
    --region "${AWS_REGION}" \
    --no-progress \
    "s3://${ARTIFACT_BUCKET}/releases/${RELEASE_ID}/manifest.json" -)"

jq -e \
    --arg release_id "${RELEASE_ID}" \
    --arg pbf_name "${PBF_NAME}" \
    --arg pbf_md5 "${PBF_MD5}" \
    '.release_id == $release_id and .source.name == $pbf_name and .source.md5 == $pbf_md5 and .archive.size_bytes > 0' \
    <<< "${manifest_json}" >/dev/null || fail "uploaded manifest did not match the requested build"

publish_state built artifact-validated

if [[ "${MODE}" == "manual" ]]; then
    FINAL_STATE_WRITTEN=true
    CURRENT_STAGE="complete"
    echo "BUILD_WORKFLOW_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} status=built"
    exit 0
fi

CURRENT_STAGE="deployment"
serving_state="$(aws ec2 describe-instances \
    --region "${AWS_REGION}" \
    --instance-ids "${SERVING_INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text 2>/dev/null || true)"

if [[ "${serving_state}" != "running" ]]; then
    publish_state deployment_pending serving-not-running
    notify_failure deployment_pending serving-not-running || true
    FINAL_STATE_WRITTEN=true
    CURRENT_STAGE="complete"
    exit 0
fi

serving_ssm_status="$(aws ssm describe-instance-information \
    --region "${AWS_REGION}" \
    --filters "Key=InstanceIds,Values=${SERVING_INSTANCE_ID}" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || true)"

if [[ "${serving_ssm_status}" != "Online" ]]; then
    publish_state deployment_pending serving-ssm-offline
    notify_failure deployment_pending serving-ssm-offline || true
    FINAL_STATE_WRITTEN=true
    CURRENT_STAGE="complete"
    exit 0
fi

readonly DEPLOY_SCRIPT_PATH="${OPERATION_ROOT}/deploy-graph.sh"
download_operation "${DEPLOY_SCRIPT_KEY}" "${DEPLOY_SCRIPT_PATH}" "${DEPLOY_SCRIPT_SHA256}"
readonly DEPLOY_SCRIPT_SHA="$(sha256sum "${DEPLOY_SCRIPT_PATH}" | awk '{print $1}')"

deployment_parameters="$(jq -nc \
    --arg script_key "${DEPLOY_SCRIPT_KEY}" \
    --arg script_sha "${DEPLOY_SCRIPT_SHA}" \
    --arg release_id "${RELEASE_ID}" \
    '{
        executionTimeout: ["3600"],
        commands: [
            "set -euo pipefail",
            "readonly SCRIPT=/var/lib/daf-routing/deploy-graph.sh",
            "aws s3 cp --region us-east-1 --no-progress s3://daf-routing-graphs-326364278889-us-east-1/" + $script_key + " $SCRIPT",
            "printf \"" + $script_sha + "  %s\\n\" \"$SCRIPT\" | sha256sum --check --status",
            "chmod 0700 \"$SCRIPT\"",
            "bash \"$SCRIPT\" --release-id " + $release_id
        ]
    }')"

DEPLOY_COMMAND_ID="$(aws ssm send-command \
    --region "${AWS_REGION}" \
    --instance-ids "${SERVING_INSTANCE_ID}" \
    --document-name AWS-RunShellScript \
    --timeout-seconds 60 \
    --parameters "${deployment_parameters}" \
    --query Command.CommandId \
    --output text)"
[[ "${DEPLOY_COMMAND_ID}" =~ ^[0-9a-f-]{36}$ ]] || fail "deployment command ID was invalid"
publish_state deploying deployment-command-started

deployment_status=""
for _ in $(seq 1 360); do
    deployment_status="$(aws ssm get-command-invocation \
        --region "${AWS_REGION}" \
        --command-id "${DEPLOY_COMMAND_ID}" \
        --instance-id "${SERVING_INSTANCE_ID}" \
        --query Status \
        --output text 2>/dev/null || true)"

    case "${deployment_status}" in
        Success)
            break
            ;;
        Cancelled|Cancelling|Failed|TimedOut)
            fail "deployment command ended with status ${deployment_status}"
            ;;
    esac

    sleep 5
done

[[ "${deployment_status}" == "Success" ]] || fail "deployment command did not finish before the timeout"

deployment_output="$(aws ssm get-command-invocation \
    --region "${AWS_REGION}" \
    --command-id "${DEPLOY_COMMAND_ID}" \
    --instance-id "${SERVING_INSTANCE_ID}" \
    --query StandardOutputContent \
    --output text)"
grep -qF "DEPLOY_OK operation=1.1.0 release=${RELEASE_ID}" <<< "${deployment_output}" \
    || fail "deployment command succeeded without the expected completion marker"

aws ssm put-parameter \
    --region "${AWS_REGION}" \
    --name /daf-routing/graph-artifact-prefix \
    --type String \
    --value "releases/${RELEASE_ID}" \
    --overwrite \
    --output json >/dev/null

publish_state deployed serving-healthy
FINAL_STATE_WRITTEN=true
CURRENT_STAGE="complete"
echo "BUILD_WORKFLOW_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} status=deployed"
