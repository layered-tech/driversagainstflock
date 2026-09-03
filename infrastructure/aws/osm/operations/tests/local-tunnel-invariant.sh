#!/usr/bin/env bash

set -Eeuo pipefail

readonly OPERATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly TUNNEL_SCRIPT="${OPERATIONS_DIR}/start-local-tunnel.sh"
readonly TEST_DIRECTORY="$(mktemp -d)"
readonly COMMAND_LOG="${TEST_DIRECTORY}/aws-command.log"
readonly DISCOVERY_LOG="${TEST_DIRECTORY}/aws-discovery.log"

cleanup()
{
    rm -rf "${TEST_DIRECTORY}"
}

trap cleanup EXIT

mkdir -p "${TEST_DIRECTORY}/bin"

cat > "${TEST_DIRECTORY}/bin/aws" <<'AWS_STUB'
#!/usr/bin/env bash

if [[ "$1 $2" == 'ec2 describe-instances' ]]; then
    printf '%s\n' "$@" > "${OSM_TUNNEL_TEST_DISCOVERY_LOG}"
    echo 'i-0123456789abcdef0'
    exit 0
fi

printf '%s\n' "$@" > "${OSM_TUNNEL_TEST_COMMAND_LOG}"
AWS_STUB

cat > "${TEST_DIRECTORY}/bin/session-manager-plugin" <<'PLUGIN_STUB'
#!/usr/bin/env bash
PLUGIN_STUB

chmod +x \
    "${TEST_DIRECTORY}/bin/aws" \
    "${TEST_DIRECTORY}/bin/session-manager-plugin"

PATH="${TEST_DIRECTORY}/bin:/usr/bin:/bin" \
OSM_TUNNEL_TEST_COMMAND_LOG="${COMMAND_LOG}" \
OSM_TUNNEL_TEST_DISCOVERY_LOG="${DISCOVERY_LOG}" \
OSM_AWS_PROFILE=test-profile \
OSM_AWS_REGION=us-west-2 \
OSM_TUNNEL_LOCAL_PORT=25432 \
    "${TUNNEL_SCRIPT}" >/dev/null

grep -qxF 'Name=tag:Project,Values=daf-osm' "${DISCOVERY_LOG}"
grep -qxF 'Name=tag:Name,Values=daf-osm-database' "${DISCOVERY_LOG}"
grep -qxF 'Name=instance-state-name,Values=running' "${DISCOVERY_LOG}"
grep -qxF 'ssm' "${COMMAND_LOG}"
grep -qxF 'start-session' "${COMMAND_LOG}"
grep -qxF 'test-profile' "${COMMAND_LOG}"
grep -qxF 'us-west-2' "${COMMAND_LOG}"
grep -qxF 'i-0123456789abcdef0' "${COMMAND_LOG}"
grep -qxF 'AWS-StartPortForwardingSession' "${COMMAND_LOG}"
grep -qxF '{"portNumber":["5432"],"localPortNumber":["25432"]}' "${COMMAND_LOG}"

echo 'Local OSM tunnel invariant passed.'
