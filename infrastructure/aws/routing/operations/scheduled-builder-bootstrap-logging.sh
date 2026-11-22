#!/usr/bin/env bash

readonly BOOTSTRAP_LOG_GROUP="/daf-routing/builder"
BOOTSTRAP_PHASE="setup"
BOOTSTRAP_COMMAND=""
BOOTSTRAP_LINE=""
BOOTSTRAP_OUTPUT=""

start_bootstrap_logging() {
    BOOTSTRAP_OUTPUT="$(mktemp /var/log/daf-routing-bootstrap.XXXXXX)"
    exec 3>&1 4>&2
    exec >> "${BOOTSTRAP_OUTPUT}" 2>&1
}

run_bootstrap_script() {
    printf -v BOOTSTRAP_COMMAND 'bash %s' "$*"
    BOOTSTRAP_LINE="${BASH_LINENO[0]}"

    bash -c '
        set -E
        trap '\''printf "ERROR exit=%s source=%s line=%s command=%s\n" "$?" "${BASH_SOURCE[0]:-$0}" "${LINENO}" "${BASH_COMMAND}" >&2'\'' ERR
        source "$0" "$@"
    ' "$@" 2>&1 | tee -a "${BOOTSTRAP_OUTPUT}" >&3
}

publish_bootstrap_failure() {
    local exit_code="$1"
    local package_output=""
    local token instance_id payload stream

    # Once the workflow reports its first state, keep using its curated logs.
    if [[ "${BOOTSTRAP_PHASE}" == "workflow" ]] &&
        grep -qF '"event":"workflow_state"' /var/log/daf-routing/builder-events.log; then
        return 0
    fi

    if [[ "${BOOTSTRAP_PHASE}" == "install-logging" ]]; then
        package_output="/var/log/daf-routing/builder-logging-packages.log"
    fi

    printf 'ERROR exit=%s phase=%s line=%s command=%s\n' \
        "${exit_code}" "${BOOTSTRAP_PHASE}" "${BOOTSTRAP_LINE}" "${BOOTSTRAP_COMMAND}" >&2
    if [[ -f "${BOOTSTRAP_OUTPUT}" ]]; then
        tail -c 8192 "${BOOTSTRAP_OUTPUT}" >&2
    fi

    token="$(curl --fail --silent --show-error --max-time 5 \
        --request PUT --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
        http://169.254.169.254/latest/api/token)" || return
    instance_id="$(curl --fail --silent --show-error --max-time 5 \
        --header "X-aws-ec2-metadata-token: ${token}" \
        http://169.254.169.254/latest/meta-data/instance-id)" || return
    [[ "${instance_id}" =~ ^i-[0-9a-f]{17}$ ]] || return 1
    stream="${instance_id}/bootstrap"

    payload="$(python3 - "${exit_code}" "${BOOTSTRAP_PHASE}" "${BOOTSTRAP_LINE}" \
        "${BOOTSTRAP_COMMAND}" "${BOOTSTRAP_OUTPUT}" "${package_output}" <<'PY'
import json
import sys
import time


def read_tail(path):
    if not path:
        return ""
    try:
        with open(path, "rb") as log:
            log.seek(max(0, log.seek(0, 2) - 8192))
            return log.read().decode("utf-8", errors="replace")
    except FileNotFoundError:
        return ""


exit_code, phase, line, command, output, package_output = sys.argv[1:]
event = {
    "event": "bootstrap_failed",
    "role": "builder",
    "phase": phase,
    "exit_code": int(exit_code),
    "line": int(line) if line else None,
    "command": command,
    "output": read_tail(output),
}
if package_output:
    event["package_output"] = read_tail(package_output)
print(json.dumps([{"timestamp": int(time.time() * 1000), "message": json.dumps(event)}]))
PY
    )" || return

    AWS_MAX_ATTEMPTS=2 aws logs create-log-stream --region "${AWS_REGION}" \
        --log-group-name "${BOOTSTRAP_LOG_GROUP}" --log-stream-name "${stream}" \
        --cli-connect-timeout 5 --cli-read-timeout 10 >/dev/null || true
    AWS_MAX_ATTEMPTS=2 aws logs put-log-events --region "${AWS_REGION}" \
        --log-group-name "${BOOTSTRAP_LOG_GROUP}" --log-stream-name "${stream}" \
        --log-events "${payload}" --cli-connect-timeout 5 --cli-read-timeout 10 >/dev/null
}
