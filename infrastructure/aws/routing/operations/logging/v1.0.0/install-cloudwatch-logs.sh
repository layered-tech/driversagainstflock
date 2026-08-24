#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.0"
readonly AWS_REGION="us-east-1"
readonly ROLE="${1:-}"
readonly LOG_DIRECTORY="/var/log/daf-routing"
readonly LOG_FILE="/var/log/daf-routing/${ROLE}-events.log"
readonly STATE_DIRECTORY="/var/lib/daf-routing-logs"
readonly AGENT_CONFIG="/opt/aws/amazon-cloudwatch-agent/etc/daf-routing-${ROLE}-logs.json"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR install-cloudwatch-logs must run as root" >&2
    exit 1
fi

if [[ "${ROLE}" != "serving" && "${ROLE}" != "builder" ]]; then
    echo "ERROR role must be serving or builder" >&2
    exit 1
fi

install -d -o root -g root -m 0750 "${LOG_DIRECTORY}" "${STATE_DIRECTORY}"
if [[ ! -e "${LOG_FILE}" ]]; then
    install -o root -g root -m 0640 /dev/null "${LOG_FILE}"
else
    chown root:root "${LOG_FILE}"
    chmod 0640 "${LOG_FILE}"
fi
dnf install -y amazon-cloudwatch-agent jq > "${LOG_DIRECTORY}/${ROLE}-logging-packages.log" 2>&1

cat > "${AGENT_CONFIG}" <<JSON
{
  "agent": {
    "region": "${AWS_REGION}",
    "run_as_user": "root"
  },
  "logs": {
    "force_flush_interval": 5,
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "${LOG_FILE}",
            "log_group_name": "/daf-routing/${ROLE}",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC"
          }
        ]
      }
    }
  }
}
JSON

printf '{"timestamp":"%s","event":"logging_ready","role":"%s","operation":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${ROLE}" "${OPERATION_VERSION}" >> "${LOG_FILE}"

if [[ "${ROLE}" == "serving" ]]; then
    readonly PUBLISHER_PATH="/usr/local/sbin/publish-daf-routing-serving-state"
    readonly SERVICE_NAME="daf-routing-serving-state.service"
    readonly TIMER_NAME="daf-routing-serving-state.timer"

    cat > "${PUBLISHER_PATH}" <<'PUBLISHER'
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
PUBLISHER

    chmod 0755 "${PUBLISHER_PATH}"

    cat > "/etc/systemd/system/${SERVICE_NAME}" <<UNIT
[Unit]
Description=Record privacy-safe DAF GraphHopper service state changes
After=graphhopper.service

[Service]
Type=oneshot
ExecStart=${PUBLISHER_PATH}
User=root
Group=root
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${LOG_DIRECTORY} ${STATE_DIRECTORY}
UNIT

    cat > "/etc/systemd/system/${TIMER_NAME}" <<UNIT
[Unit]
Description=Check DAF GraphHopper service state every minute

[Timer]
OnBootSec=15s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
UNIT

    systemctl daemon-reload
    systemctl enable --now "${TIMER_NAME}"
    systemctl start "${SERVICE_NAME}"
    systemctl is-active --quiet "${TIMER_NAME}"
fi

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c "file:${AGENT_CONFIG}"
systemctl is-active --quiet amazon-cloudwatch-agent

echo "INSTALL_LOGS_OK operation=${OPERATION_VERSION} role=${ROLE} source=curated-events"
