#!/usr/bin/env bash

set -Eeuo pipefail

readonly OPERATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly TUNNEL_SCRIPT="${OPERATIONS_DIR}/start-local-tunnel.sh"
readonly PACKAGE_JSON="${OPERATIONS_DIR}/../../../../package.json"
readonly TEST_DIRECTORY="$(mktemp -d)"
readonly COMMAND_LOG="${TEST_DIRECTORY}/aws-command.log"
readonly DISCOVERY_LOG="${TEST_DIRECTORY}/aws-discovery.log"
readonly OUTPUT_LOG="${TEST_DIRECTORY}/tunnel-output.log"

cleanup()
{
    rm -rf "${TEST_DIRECTORY}"
}

trap cleanup EXIT

mkdir -p "${TEST_DIRECTORY}/bin"

cat > "${TEST_DIRECTORY}/bin/aws" <<'AWS_STUB'
#!/usr/bin/env bash

if [[ "$1 $2" == 'ec2 describe-instances' ]]; then
    printf '%s\n' "$@" > "${GRAPHHOPPER_TUNNEL_TEST_DISCOVERY_LOG}"
    echo 'i-0123456789abcdef0'
    exit 0
fi

printf '%s\n' "$@" > "${GRAPHHOPPER_TUNNEL_TEST_COMMAND_LOG}"
AWS_STUB

cat > "${TEST_DIRECTORY}/bin/session-manager-plugin" <<'PLUGIN_STUB'
#!/usr/bin/env bash
PLUGIN_STUB

chmod +x \
    "${TEST_DIRECTORY}/bin/aws" \
    "${TEST_DIRECTORY}/bin/session-manager-plugin"

PATH="${TEST_DIRECTORY}/bin:/usr/bin:/bin" \
GRAPHHOPPER_TUNNEL_TEST_COMMAND_LOG="${COMMAND_LOG}" \
GRAPHHOPPER_TUNNEL_TEST_DISCOVERY_LOG="${DISCOVERY_LOG}" \
GRAPHHOPPER_AWS_PROFILE=test-profile \
GRAPHHOPPER_AWS_REGION=us-west-2 \
GRAPHHOPPER_TUNNEL_LOCAL_PORT=28080 \
    "${TUNNEL_SCRIPT}" > "${OUTPUT_LOG}"

grep -qF '"graphhopper:tunnel": "./infrastructure/aws/routing/operations/start-local-tunnel.sh"' "${PACKAGE_JSON}"
grep -qxF 'Name=tag:Project,Values=daf-osm' "${DISCOVERY_LOG}"
grep -qxF 'Name=tag:Name,Values=daf-osm-database' "${DISCOVERY_LOG}"
grep -qxF 'Name=instance-state-name,Values=running' "${DISCOVERY_LOG}"
grep -qxF 'ssm' "${COMMAND_LOG}"
grep -qxF 'start-session' "${COMMAND_LOG}"
grep -qxF 'test-profile' "${COMMAND_LOG}"
grep -qxF 'us-west-2' "${COMMAND_LOG}"
grep -qxF 'i-0123456789abcdef0' "${COMMAND_LOG}"
grep -qxF 'AWS-StartPortForwardingSession' "${COMMAND_LOG}"
grep -qxF '{"portNumber":["8989"],"localPortNumber":["28080"]}' "${COMMAND_LOG}"
grep -qxF 'Set GRAPHHOPPER_URL=http://127.0.0.1:28080 while using this tunnel.' "${OUTPUT_LOG}"

echo 'Local GraphHopper tunnel invariant passed.'
