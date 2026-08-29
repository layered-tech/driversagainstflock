#!/usr/bin/env bash

set -Eeuo pipefail

readonly AWS_PROFILE_NAME="${GRAPHHOPPER_AWS_PROFILE:-daf-routing}"
readonly AWS_REGION_NAME="${GRAPHHOPPER_AWS_REGION:-us-east-1}"
readonly LOCAL_GRAPHHOPPER_PORT="${GRAPHHOPPER_TUNNEL_LOCAL_PORT:-18989}"
readonly REMOTE_GRAPHHOPPER_PORT=8989

fail()
{
    echo "ERROR: $*" >&2
    exit 1
}

command -v aws >/dev/null 2>&1 || fail 'AWS CLI is required.'

if ! command -v session-manager-plugin >/dev/null 2>&1; then
    readonly MACOS_SESSION_MANAGER_DIRECTORY=/usr/local/sessionmanagerplugin/bin

    if [[ -x "${MACOS_SESSION_MANAGER_DIRECTORY}/session-manager-plugin" ]]; then
        export PATH="${MACOS_SESSION_MANAGER_DIRECTORY}:${PATH}"
    else
        fail 'AWS Session Manager plugin is required: https://docs.aws.amazon.com/systems-manager/latest/userguide/install-plugin-macos-overview.html'
    fi
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${LOCAL_GRAPHHOPPER_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Local port ${LOCAL_GRAPHHOPPER_PORT} is already in use."
fi

instance_ids="$({
    aws ec2 describe-instances \
        --profile "${AWS_PROFILE_NAME}" \
        --region "${AWS_REGION_NAME}" \
        --filters \
            'Name=tag:Project,Values=daf-routing' \
            'Name=tag:Name,Values=daf-routing-serving' \
            'Name=instance-state-name,Values=running' \
        --query 'Reservations[].Instances[].InstanceId' \
        --output text
} 2>&1)" || fail "Unable to find the GraphHopper serving instance: ${instance_ids}"

read -r -a instance_id_list <<< "${instance_ids}"

if [[ "${#instance_id_list[@]}" -ne 1 || ! "${instance_id_list[0]}" =~ ^i-[a-zA-Z0-9]+$ ]]; then
    fail "Expected one running GraphHopper serving instance, found: ${instance_ids:-none}"
fi

readonly INSTANCE_ID="${instance_id_list[0]}"

echo "Opening GraphHopper tunnel on 127.0.0.1:${LOCAL_GRAPHHOPPER_PORT}."
echo "Set GRAPHHOPPER_URL=http://127.0.0.1:${LOCAL_GRAPHHOPPER_PORT} while using this tunnel."
echo 'Keep this command running while testing directions.'

exec aws ssm start-session \
    --profile "${AWS_PROFILE_NAME}" \
    --region "${AWS_REGION_NAME}" \
    --target "${INSTANCE_ID}" \
    --document-name AWS-StartPortForwardingSession \
    --parameters "{\"portNumber\":[\"${REMOTE_GRAPHHOPPER_PORT}\"],\"localPortNumber\":[\"${LOCAL_GRAPHHOPPER_PORT}\"]}"
