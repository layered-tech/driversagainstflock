#!/usr/bin/env bash

set -euo pipefail

export AWS_PAGER=""

readonly AWS_PROFILE="daf-routing"
readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly ACTIVE_BUILD_KEY="operations/active-build.json"
readonly STATUS_INTERVAL_SECONDS=15

WATCH=false

usage() {
    cat <<'USAGE'
Usage: npm run graph:status -- [--watch]

Show the latest GraphHopper build after reconnecting to a terminal.

Options:
  --watch    Refresh every 15 seconds until the build finishes.
  --help     Show this help.
USAGE
}

fail() {
    echo "ERROR $*" >&2
    exit 1
}

while (( $# > 0 )); do
    case "$1" in
        --watch)
            WATCH=true
            shift
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

command -v aws >/dev/null 2>&1 || fail "required command not found: aws"
command -v jq >/dev/null 2>&1 || fail "required command not found: jq"

while true; do
    state_json="$(aws s3 cp \
        "s3://${ARTIFACT_BUCKET}/${ACTIVE_BUILD_KEY}" - \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --no-progress 2>/dev/null || true)"
    [[ -n "${state_json}" ]] || fail "no recorded graph build was found"

    release_id="$(jq -r '.release_id // empty' <<< "${state_json}")"
    pbf_name="$(jq -r '.pbf_name // empty' <<< "${state_json}")"
    instance_id="$(jq -r '.instance_id // empty' <<< "${state_json}")"
    command_id="$(jq -r '.command_id // empty' <<< "${state_json}")"
    started_at="$(jq -r '.started_at // empty' <<< "${state_json}")"
    mode="$(jq -r '.mode // "manual"' <<< "${state_json}")"
    workflow_status="$(jq -r '.status // .launcher_status // "running"' <<< "${state_json}")"
    workflow_detail="$(jq -r '.detail // "waiting"' <<< "${state_json}")"

    [[ "${release_id}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || fail "recorded release ID is invalid"
    [[ "${pbf_name}" =~ ^us-[0-9]{6}\.osm\.pbf$ ]] || fail "recorded PBF name is invalid"
    [[ "${instance_id}" =~ ^i-[0-9a-f]{17}$ ]] || fail "recorded instance ID is invalid"
    [[ -z "${command_id}" || "${command_id}" =~ ^[0-9a-f-]{36}$ ]] || fail "recorded SSM command ID is invalid"

    instance_state="$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --instance-ids "${instance_id}" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null || true)"
    [[ -n "${instance_state}" && "${instance_state}" != "None" ]] || instance_state="not-found"

    command_status="not-started"
    if [[ -n "${command_id}" ]]; then
        command_status="$(aws ssm get-command-invocation \
            --profile "${AWS_PROFILE}" \
            --region "${AWS_REGION}" \
            --command-id "${command_id}" \
            --instance-id "${instance_id}" \
            --query Status \
            --output text 2>/dev/null || true)"
        [[ -n "${command_status}" ]] || command_status="unknown"
    fi

    progress_json="$(aws s3 cp \
        "s3://${ARTIFACT_BUCKET}/operations/builds/${release_id}/status.json" - \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --no-progress 2>/dev/null || true)"

    progress="waiting"
    resources="waiting"
    if [[ -n "${progress_json}" ]]; then
        progress="$(jq -r '"\(.percent)% — \(.phase) (\(.detail))"' <<< "${progress_json}")"
        resources="$(jq -r '"CPU \(.resources.cpu_used_percent // 0)% | Memory \(.resources.memory_used_percent // 0)% | Scratch \(.resources.scratch_used_percent // 0)%"' <<< "${progress_json}")"
    fi

    artifact_ready="no"
    if aws s3api head-object \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" \
        --bucket "${ARTIFACT_BUCKET}" \
        --key "releases/${release_id}/manifest.json" \
        --output json >/dev/null 2>&1; then
        artifact_ready="yes"
    fi

    printf 'Release:  %s\nSnapshot: %s\nMode:     %s\nStatus:   %s (%s)\nStarted:  %s\nInstance: %s (%s)\nCommand:  %s\nProgress: %s\nResources: %s\nArtifact: %s\n' \
        "${release_id}" \
        "${pbf_name}" \
        "${mode}" \
        "${workflow_status}" \
        "${workflow_detail}" \
        "${started_at}" \
        "${instance_id}" \
        "${instance_state}" \
        "${command_status}" \
        "${progress}" \
        "${resources}" \
        "${artifact_ready}"

    if [[ "${WATCH}" != "true" ]]; then
        exit 0
    fi
    case "${workflow_status}" in
        build_failed|deployment_pending|deployment_failed|deployed)
            exit 0
            ;;
        built)
            if [[ "${mode}" == "manual" ]]; then
                exit 0
            fi
            ;;
    esac

    case "${command_status}" in
        Success|Cancelled|Cancelling|Failed|TimedOut)
            exit 0
            ;;
    esac

    echo
    sleep "${STATUS_INTERVAL_SECONDS}"
done
