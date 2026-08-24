#!/usr/bin/env bash

set -euo pipefail

readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly BOOTSTRAP_VERSION="v1.0.0"
readonly ALERTS_TOPIC_ARN="arn:aws:sns:us-east-1:326364278889:daf-routing-alerts"
readonly BOOTSTRAP_KEY="operations/scheduled-builder/${BOOTSTRAP_VERSION}/run-build.sh"
readonly BOOTSTRAP_PATH="/var/lib/daf-routing-build/run-build.sh"
readonly BOOTSTRAP_SHA256="51f6bd56cc2a57958828497e83e98096b9071617d2d73bbc7eba282fa2c31e73"
readonly LOGGING_VERSION="v1.0.0"
readonly LOGGING_KEY="operations/logging/${LOGGING_VERSION}/install-cloudwatch-logs.sh"
readonly LOGGING_PATH="/var/lib/daf-routing-build/install-cloudwatch-logs.sh"
readonly LOGGING_SHA256="253cac7e858b77c2a8f612ef3dd001ae841199376668b9a9934a566a5b48dfc3"

finish() {
    local exit_code=$?

    trap - EXIT

    if (( exit_code != 0 )); then
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
bash "${LOGGING_PATH}" builder
install -d -m 0700 "$(dirname "${BOOTSTRAP_PATH}")"

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
bash "${BOOTSTRAP_PATH}" --mode scheduled
