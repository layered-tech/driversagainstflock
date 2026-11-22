#!/usr/bin/env bash

set -euo pipefail

readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly BOOTSTRAP_VERSION="v1.0.0"
readonly ALERTS_TOPIC_ARN="arn:aws:sns:us-east-1:326364278889:daf-routing-alerts"
readonly BOOTSTRAP_KEY="operations/scheduled-builder/${BOOTSTRAP_VERSION}/run-build.sh"
readonly BOOTSTRAP_PATH="/var/lib/daf-routing-build/run-build.sh"
readonly BOOTSTRAP_SHA256="188cff6dc39bb1587102426ef877074dcf1ce79a49cd40d0216988e5d83a06df"
readonly LOGGING_VERSION="v1.0.0"
readonly LOGGING_KEY="operations/logging/${LOGGING_VERSION}/install-cloudwatch-logs.sh"
readonly LOGGING_PATH="/var/lib/daf-routing-build/install-cloudwatch-logs.sh"
readonly LOGGING_SHA256="253cac7e858b77c2a8f612ef3dd001ae841199376668b9a9934a566a5b48dfc3"

# Scheduled bootstrap logging

finish() {
    local exit_code=$?

    trap - EXIT ERR

    if [[ -n "${BOOTSTRAP_OUTPUT}" ]]; then
        exec >&3 2>&4 3>&- 4>&-
    fi

    if (( exit_code != 0 )); then
        publish_bootstrap_failure "${exit_code}" || echo "ERROR could not publish bootstrap diagnostics" >&2
        aws sns publish \
            --region "${AWS_REGION}" \
            --topic-arn "${ALERTS_TOPIC_ARN}" \
            --subject "DAF routing graph bootstrap failure" \
            --message "The scheduled graph builder failed before its workflow completed." \
            --output json >/dev/null 2>&1 || true
    fi

    shutdown -h +1
    exit "${exit_code}"
}

trap finish EXIT
trap 'BOOTSTRAP_COMMAND=${BASH_COMMAND} BOOTSTRAP_LINE=${LINENO}' ERR
start_bootstrap_logging

cat > /etc/systemd/system/daf-routing-builder-expiry.service <<'UNIT'
[Unit]
Description=Terminate expired DAF GraphHopper builder

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl poweroff
UNIT

cat > /etc/systemd/system/daf-routing-builder-expiry.timer <<'UNIT'
[Unit]
Description=13-hour safety limit for DAF GraphHopper builder

[Timer]
OnBootSec=13h
Unit=daf-routing-builder-expiry.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now daf-routing-builder-expiry.timer
install -d -m 0700 "$(dirname "${LOGGING_PATH}")"
BOOTSTRAP_PHASE="download-logging"
logging_object_sha="$(aws s3api head-object \
    --region "${AWS_REGION}" \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "${LOGGING_KEY}" \
    --query 'Metadata.sha256' \
    --output text)"
[[ "${logging_object_sha}" == "${LOGGING_SHA256}" ]]
aws s3 cp \
    --region "${AWS_REGION}" \
    --no-progress \
    "s3://${ARTIFACT_BUCKET}/${LOGGING_KEY}" "${LOGGING_PATH}"
printf '%s  %s\n' "${LOGGING_SHA256}" "${LOGGING_PATH}" | sha256sum --check --status
chmod 0700 "${LOGGING_PATH}"
BOOTSTRAP_PHASE="install-logging"
run_bootstrap_script "${LOGGING_PATH}" builder
install -d -m 0700 "$(dirname "${BOOTSTRAP_PATH}")"

BOOTSTRAP_PHASE="download-workflow"
object_sha="$(aws s3api head-object \
    --region "${AWS_REGION}" \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "${BOOTSTRAP_KEY}" \
    --query 'Metadata.sha256' \
    --output text)"
[[ "${object_sha}" == "${BOOTSTRAP_SHA256}" ]]
aws s3 cp \
    --region "${AWS_REGION}" \
    --no-progress \
    "s3://${ARTIFACT_BUCKET}/${BOOTSTRAP_KEY}" "${BOOTSTRAP_PATH}"
printf '%s  %s\n' "${BOOTSTRAP_SHA256}" "${BOOTSTRAP_PATH}" | sha256sum --check --status
chmod 0700 "${BOOTSTRAP_PATH}"
BOOTSTRAP_PHASE="workflow"
run_bootstrap_script "${BOOTSTRAP_PATH}" --mode scheduled
