#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.10"
readonly PUBLISHER_PATH="/usr/local/sbin/publish-daf-routing-serving-metrics"
readonly SERVICE_NAME="daf-routing-serving-metrics.service"
readonly TIMER_NAME="daf-routing-serving-metrics.timer"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR install-serving-metrics must run as root" >&2
    exit 1
fi

dnf install -y jq >/dev/null

cat > "${PUBLISHER_PATH}" <<'SCRIPT'
#!/usr/bin/env bash

set -euo pipefail

readonly AWS_REGION="us-east-1"
readonly GRAPH_MOUNT="/var/lib/graphhopper"
readonly METRICS_PATH="$(mktemp /run/daf-routing-serving-metrics/metrics.XXXXXX.json)"

cleanup() {
    rm -f "${METRICS_PATH}"
}

trap cleanup EXIT

if ! mountpoint --quiet "${GRAPH_MOUNT}"; then
    echo "ERROR graph volume is not mounted" >&2
    exit 1
fi

readonly IMDS_TOKEN="$(curl --fail --silent --show-error --request PUT \
    --max-time 5 \
    --header 'X-aws-ec2-metadata-token-ttl-seconds: 300' \
    http://169.254.169.254/latest/api/token)"
readonly INSTANCE_ID="$(curl --fail --silent --show-error \
    --max-time 5 \
    --header "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" \
    http://169.254.169.254/latest/meta-data/instance-id)"
readonly GRAPH_USED_PERCENT="$(df --output=pcent "${GRAPH_MOUNT}" | tail -n 1 | tr -dc '0-9')"
readonly MEMORY_TOTAL_KIB="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
readonly MEMORY_AVAILABLE_KIB="$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)"

if [[ ! "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ || ! "${GRAPH_USED_PERCENT}" =~ ^[0-9]+$ || ! "${MEMORY_TOTAL_KIB}" =~ ^[0-9]+$ || ! "${MEMORY_AVAILABLE_KIB}" =~ ^[0-9]+$ ]]; then
    echo "ERROR invalid serving metric input" >&2
    exit 1
fi

readonly MEMORY_USED_PERCENT="$(awk -v total="${MEMORY_TOTAL_KIB}" -v available="${MEMORY_AVAILABLE_KIB}" 'BEGIN { printf "%.2f", ((total - available) / total) * 100 }')"

jq -n \
    --arg instance_id "${INSTANCE_ID}" \
    --argjson graph_used_percent "${GRAPH_USED_PERCENT}" \
    --argjson memory_used_percent "${MEMORY_USED_PERCENT}" \
    '[
        {
            MetricName: "ServingGraphVolumeUsedPercent",
            Dimensions: [{Name: "InstanceId", Value: $instance_id}],
            Unit: "Percent",
            Value: $graph_used_percent
        },
        {
            MetricName: "ServingMemoryUsedPercent",
            Dimensions: [{Name: "InstanceId", Value: $instance_id}],
            Unit: "Percent",
            Value: $memory_used_percent
        }
    ]' > "${METRICS_PATH}"

aws cloudwatch put-metric-data \
    --region "${AWS_REGION}" \
    --namespace DAF/Routing \
    --metric-data "file://${METRICS_PATH}"
SCRIPT

chmod 0755 "${PUBLISHER_PATH}"

cat > "/etc/systemd/system/${SERVICE_NAME}" <<UNIT
[Unit]
Description=Publish DAF routing serving utilization metrics
After=network-online.target
Wants=network-online.target
RequiresMountsFor=/var/lib/graphhopper

[Service]
Type=oneshot
ExecStart=${PUBLISHER_PATH}
TimeoutStartSec=30s
User=root
Group=root
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadOnlyPaths=/var/lib/graphhopper /proc/meminfo
ReadWritePaths=/run/daf-routing-serving-metrics
RuntimeDirectory=daf-routing-serving-metrics
RuntimeDirectoryMode=0750
UNIT

cat > "/etc/systemd/system/${TIMER_NAME}" <<UNIT
[Unit]
Description=Publish DAF routing serving utilization metrics every minute

[Timer]
OnBootSec=30s
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

echo "INSTALL_METRICS_OK operation=${OPERATION_VERSION} interval=60s metrics=graph-volume,memory"
