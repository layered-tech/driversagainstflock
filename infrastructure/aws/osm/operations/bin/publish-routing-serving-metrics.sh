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
