#!/usr/bin/env bash

set -euo pipefail

readonly LOG_FILE="/var/log/daf-routing/serving-events.log"
readonly STATE_DIRECTORY="/var/lib/daf-routing-logs"
readonly STATE_FILE="${STATE_DIRECTORY}/serving-state"
readonly TEMPORARY_STATE_FILE="${STATE_FILE}.tmp"
readonly ACTIVE_STATE="$(systemctl show graphhopper.service --property ActiveState --value)"
readonly SUB_STATE="$(systemctl show graphhopper.service --property SubState --value)"
readonly RESULT="$(systemctl show graphhopper.service --property Result --value)"
readonly EXIT_CODE="$(systemctl show graphhopper.service --property ExecMainStatus --value)"
readonly RESTART_COUNT="$(systemctl show graphhopper.service --property NRestarts --value)"
readonly CURRENT_STATE="${ACTIVE_STATE}|${SUB_STATE}|${RESULT}|${EXIT_CODE}|${RESTART_COUNT}"

if [[ ! "${ACTIVE_STATE}" =~ ^[a-z-]+$ \
    || ! "${SUB_STATE}" =~ ^[a-z-]+$ \
    || ! "${RESULT}" =~ ^[a-z-]+$ \
    || ! "${EXIT_CODE}" =~ ^[0-9]+$ \
    || ! "${RESTART_COUNT}" =~ ^[0-9]+$ ]]; then
    echo "ERROR invalid GraphHopper service state" >&2
    exit 1
fi

if [[ -f "${STATE_FILE}" ]] && [[ "$(< "${STATE_FILE}")" == "${CURRENT_STATE}" ]]; then
    exit 0
fi

jq -nc \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg active_state "${ACTIVE_STATE}" \
    --arg sub_state "${SUB_STATE}" \
    --arg result "${RESULT}" \
    --argjson exit_code "${EXIT_CODE}" \
    --argjson restart_count "${RESTART_COUNT}" \
    '{
        timestamp: $timestamp,
        event: "service_state",
        role: "serving",
        service: "graphhopper",
        active_state: $active_state,
        sub_state: $sub_state,
        result: $result,
        exit_code: $exit_code,
        restart_count: $restart_count
    }' >> "${LOG_FILE}"

printf '%s\n' "${CURRENT_STATE}" > "${TEMPORARY_STATE_FILE}"
chmod 0600 "${TEMPORARY_STATE_FILE}"
mv -f "${TEMPORARY_STATE_FILE}" "${STATE_FILE}"
