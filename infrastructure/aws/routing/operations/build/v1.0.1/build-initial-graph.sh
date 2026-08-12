#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.1"
readonly AWS_REGION="us-east-1"
readonly ARTIFACT_BUCKET="daf-routing-graphs-326364278889-us-east-1"
readonly GRAPHHOPPER_VERSION="11.0"
readonly GRAPHHOPPER_SHA256="b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def"
readonly GRAPHHOPPER_URL="https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"
readonly PBF_NAME="us-260811.osm.pbf"
readonly PBF_URL="https://download.geofabrik.de/north-america/${PBF_NAME}"
readonly PBF_MD5="31b9933dd0d726ef6e7448a8d3b622ca"
readonly BUILD_MOUNT="/mnt/daf-build"
readonly PROGRESS_DIR="/var/lib/daf-routing-build"
readonly PROGRESS_FILE="${PROGRESS_DIR}/progress"
readonly BUILD_STARTED_EPOCH="$(date +%s)"
MONITOR_PID=""

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR build-initial-graph must run as root" >&2
    exit 1
fi

if [[ "${1:-}" != "--scratch-volume-id" || ! "${2:-}" =~ ^vol-[0-9a-f]{17}$ ]]; then
    echo "ERROR missing scratch volume ID" >&2
    exit 1
fi

if [[ "${3:-}" != "--release-id" || ! "${4:-}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]]; then
    echo "ERROR invalid release ID" >&2
    exit 1
fi

readonly SCRATCH_VOLUME_ID="$2"
readonly RELEASE_ID="$4"
readonly EXPECTED_VOLUME_SERIAL="${SCRATCH_VOLUME_ID//-/}"
readonly RELEASE_PREFIX="releases/${RELEASE_ID}"

install -d -m 0755 "${PROGRESS_DIR}"

write_progress() {
    local phase="$1"
    local percent="$2"
    local detail="$3"
    local temporary_file="${PROGRESS_FILE}.tmp"

    printf 'phase=%s\npercent=%s\ndetail=%s\nupdated_epoch=%s\n' \
        "${phase}" "${percent}" "${detail}" "$(date +%s)" > "${temporary_file}"
    chmod 0644 "${temporary_file}"
    mv -f "${temporary_file}" "${PROGRESS_FILE}"
    echo "PROGRESS phase=${phase} percent=${percent} detail=${detail}"
}

finish() {
    local exit_code=$?

    if [[ -n "${MONITOR_PID}" ]]; then
        kill "${MONITOR_PID}" >/dev/null 2>&1 || true
        wait "${MONITOR_PID}" >/dev/null 2>&1 || true
    fi

    if (( exit_code != 0 )); then
        write_progress failed 0 "build-command-exit-${exit_code}"
    fi

    if declare -F publish_telemetry >/dev/null; then
        publish_telemetry || true
    fi

    exit "${exit_code}"
}

trap finish EXIT

resolve_scratch_device() {
    local candidate
    local serial

    for candidate in /dev/nvme*n1; do
        [[ -b "${candidate}" ]] || continue
        serial="$(lsblk -ndo SERIAL "${candidate}" | tr -d '[:space:]-')"

        if [[ "${serial}" == "${EXPECTED_VOLUME_SERIAL}" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    return 1
}

write_progress setup 2 installing-runtime
dnf install -y java-17-amazon-corretto-headless jq xfsprogs zstd > "${PROGRESS_DIR}/packages.log" 2>&1

readonly SCRATCH_DEVICE="$(resolve_scratch_device || true)"

if [[ -z "${SCRATCH_DEVICE}" ]]; then
    echo "ERROR expected scratch volume is not attached" >&2
    exit 1
fi

readonly ROOT_SOURCE="$(findmnt -nro SOURCE /)"
readonly ROOT_PARENT="/dev/$(lsblk -ndo PKNAME "${ROOT_SOURCE}")"

if [[ "${SCRATCH_DEVICE}" == "${ROOT_SOURCE}" || "${SCRATCH_DEVICE}" == "${ROOT_PARENT}" ]]; then
    echo "ERROR refusing to format the root device" >&2
    exit 1
fi

readonly SCRATCH_DEVICE_SIZE="$(blockdev --getsize64 "${SCRATCH_DEVICE}")"

if (( SCRATCH_DEVICE_SIZE < 700 * 1024 * 1024 * 1024 )); then
    echo "ERROR scratch volume is smaller than 700 GiB" >&2
    exit 1
fi

scratch_filesystem="$(lsblk -ndo FSTYPE "${SCRATCH_DEVICE}")"

if [[ -z "${scratch_filesystem}" ]]; then
    mkfs.xfs -L daf-build "${SCRATCH_DEVICE}" > "${PROGRESS_DIR}/mkfs.log"
elif [[ "${scratch_filesystem}" != "xfs" ]]; then
    echo "ERROR scratch volume has an unexpected filesystem" >&2
    exit 1
fi

install -d -m 0755 "${BUILD_MOUNT}"

if ! mountpoint --quiet "${BUILD_MOUNT}"; then
    mount -o nodev,nosuid "${SCRATCH_DEVICE}" "${BUILD_MOUNT}"
fi

publish_telemetry() {
    local phase="unknown"
    local percent="0"
    local detail="waiting"
    local updated_epoch="$(date +%s)"
    local elapsed_seconds="$(( updated_epoch - BUILD_STARTED_EPOCH ))"
    local memory_used_percent
    local scratch_used_percent
    local pbf_bytes="0"
    local archive_bytes="0"
    local status_path="${PROGRESS_DIR}/status.json"
    local metrics_path="${PROGRESS_DIR}/metrics.json"

    if [[ -f "${PROGRESS_FILE}" ]]; then
        phase="$(awk -F= '$1 == "phase" {print $2}' "${PROGRESS_FILE}")"
        percent="$(awk -F= '$1 == "percent" {print $2}' "${PROGRESS_FILE}")"
        detail="$(awk -F= '$1 == "detail" {print $2}' "${PROGRESS_FILE}")"
    fi

    memory_used_percent="$(awk '/MemTotal/ {total=$2} /MemAvailable/ {available=$2} END {printf "%.2f", (total-available)*100/total}' /proc/meminfo)"
    scratch_used_percent="$(df -P "${BUILD_MOUNT}" | awk 'NR == 2 {printf "%.2f", $5+0}')"
    [[ -f "${PBF_PATH:-}" ]] && pbf_bytes="$(stat -c '%s' "${PBF_PATH}")"
    [[ -f "${ARCHIVE_PATH:-}" ]] && archive_bytes="$(stat -c '%s' "${ARCHIVE_PATH}")"

    jq -n \
        --arg release_id "${RELEASE_ID}" \
        --arg phase "${phase}" \
        --arg detail "${detail}" \
        --argjson percent "${percent}" \
        --argjson updated_epoch "${updated_epoch}" \
        --argjson elapsed_seconds "${elapsed_seconds}" \
        --argjson memory_used_percent "${memory_used_percent}" \
        --argjson scratch_used_percent "${scratch_used_percent}" \
        --argjson pbf_bytes "${pbf_bytes}" \
        --argjson archive_bytes "${archive_bytes}" \
        '{
            release_id: $release_id,
            phase: $phase,
            detail: $detail,
            percent: $percent,
            updated_epoch: $updated_epoch,
            elapsed_seconds: $elapsed_seconds,
            resources: {
                memory_used_percent: $memory_used_percent,
                scratch_used_percent: $scratch_used_percent,
                pbf_bytes: $pbf_bytes,
                archive_bytes: $archive_bytes
            }
        }' > "${status_path}"

    jq -n \
        --arg release_id "${RELEASE_ID}" \
        --argjson percent "${percent}" \
        --argjson elapsed_seconds "${elapsed_seconds}" \
        --argjson memory_used_percent "${memory_used_percent}" \
        --argjson scratch_used_percent "${scratch_used_percent}" \
        '[
            {MetricName: "InitialGraphBuildProgress", Dimensions: [{Name: "ReleaseId", Value: $release_id}], Unit: "Percent", Value: $percent},
            {MetricName: "InitialGraphBuildElapsed", Dimensions: [{Name: "ReleaseId", Value: $release_id}], Unit: "Seconds", Value: $elapsed_seconds},
            {MetricName: "BuilderMemoryUsed", Dimensions: [{Name: "ReleaseId", Value: $release_id}], Unit: "Percent", Value: $memory_used_percent},
            {MetricName: "BuilderScratchUsed", Dimensions: [{Name: "ReleaseId", Value: $release_id}], Unit: "Percent", Value: $scratch_used_percent}
        ]' > "${metrics_path}"

    aws cloudwatch put-metric-data --region "${AWS_REGION}" --namespace DAF/Routing --metric-data "file://${metrics_path}"
    aws s3 cp --region "${AWS_REGION}" --no-progress "${status_path}" \
        "s3://${ARTIFACT_BUCKET}/operations/builds/${RELEASE_ID}/status.json" \
        --content-type application/json >/dev/null
}

telemetry_loop() {
    while true; do
        publish_telemetry || true
        sleep 60
    done
}

install -d -m 0755 "${BUILD_MOUNT}/download" "${BUILD_MOUNT}/output"
readonly PBF_PATH="${BUILD_MOUNT}/download/${PBF_NAME}"
readonly JAR_PATH="${BUILD_MOUNT}/download/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"
readonly CONFIG_PATH="${BUILD_MOUNT}/build-config.yml"
readonly GRAPH_PATH="${BUILD_MOUNT}/graph-cache"
readonly ARCHIVE_PATH="${BUILD_MOUNT}/output/graph-cache.tar.zst"
readonly MANIFEST_PATH="${BUILD_MOUNT}/output/manifest.json"

telemetry_loop &
MONITOR_PID=$!

write_progress download 5 downloading-us-pbf
curl --fail --location --silent --show-error --output "${PBF_PATH}" "${PBF_URL}"
write_progress checksum 15 verifying-us-pbf
printf '%s  %s\n' "${PBF_MD5}" "${PBF_PATH}" | md5sum --check --status

write_progress setup 18 downloading-graphhopper
curl --fail --location --silent --show-error --output "${JAR_PATH}" "${GRAPHHOPPER_URL}"
printf '%s  %s\n' "${GRAPHHOPPER_SHA256}" "${JAR_PATH}" | sha256sum --check --status

cat > "${CONFIG_PATH}" <<YAML
graphhopper:
  datareader.file: ${PBF_PATH}
  graph.location: ${GRAPH_PATH}
  profiles:
    - name: car
      turn_costs:
        vehicle_types: [motorcar, motor_vehicle]
        u_turn_costs: 60
      custom_model_files: [car.json]
  profiles_ch: []
  profiles_lm:
    - profile: car
  graph.encoded_values: car_access, car_average_speed, road_access
  prepare.lm.threads: 16
  routing.max_visited_nodes: 1000000
  routing.timeout_ms: 300000
  routing.non_ch.max_waypoint_distance: 1000000
  graph.dataaccess.default_type: MMAP

server:
  application_connectors:
    - type: http
      port: 8989
      bind_host: 127.0.0.1
      max_request_header_size: 50k
  request_log:
    appenders: []
  admin_connectors:
    - type: http
      port: 8990
      bind_host: 127.0.0.1

logging:
  level: INFO
  appenders:
    - type: file
      current_log_filename: ${PROGRESS_DIR}/graphhopper.log
      archive: false
      log_format: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
YAML

java -jar "${JAR_PATH}" check "${CONFIG_PATH}" > "${PROGRESS_DIR}/config-check.log" 2>&1

write_progress import 20 importing-and-preparing-lm
java -Xms32g -Xmx104g -XX:+UseZGC -Dfile.encoding=UTF-8 \
    -jar "${JAR_PATH}" import "${CONFIG_PATH}" > "${PROGRESS_DIR}/import.log" 2>&1

write_progress validate 72 starting-validation-server
java -Xms16g -Xmx32g -XX:+UseZGC -Dfile.encoding=UTF-8 \
    -jar "${JAR_PATH}" server "${CONFIG_PATH}" > "${PROGRESS_DIR}/server.log" 2>&1 &
readonly SERVER_PID=$!

stop_server() {
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
}

trap 'stop_server; finish' EXIT

server_ready=false

for _ in $(seq 1 180); do
    if curl --fail --silent --output /dev/null http://127.0.0.1:8989/info; then
        server_ready=true
        break
    fi

    if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
        break
    fi

    sleep 2
done

if [[ "${server_ready}" != "true" ]]; then
    echo "ERROR validation server did not become ready" >&2
    exit 1
fi

validate_route() {
    local label="$1"
    local request_url="$2"
    local response_path="${BUILD_MOUNT}/output/validation-${label}.json"

    curl --fail --silent --show-error --output "${response_path}" "${request_url}"
    jq -e '.paths[0].distance > 0 and .paths[0].time > 0' "${response_path}" >/dev/null
    rm -f "${response_path}"
    echo "VALIDATION_OK route=${label}"
}

write_progress validate 75 validating-representative-routes
validate_route urban 'http://127.0.0.1:8989/route?point=41.8781,-87.6298&point=42.3314,-83.0458&profile=car&instructions=false&calc_points=false'
validate_route rural 'http://127.0.0.1:8989/route?point=38.0467,-97.3450&point=39.0119,-98.4842&profile=car&instructions=false&calc_points=false'
validate_route interstate 'http://127.0.0.1:8989/route?point=40.7128,-74.0060&point=42.3601,-71.0589&profile=car&instructions=false&calc_points=false'
validate_route cross-country 'http://127.0.0.1:8989/route?point=34.0522,-118.2437&point=40.7128,-74.0060&profile=car&instructions=false&calc_points=false'
validate_route turn-restrictions 'http://127.0.0.1:8989/route?point=29.7604,-95.3698&point=30.2672,-97.7431&profile=car&instructions=true&calc_points=false'
stop_server
trap finish EXIT

write_progress archive 80 compressing-graph
tar -I 'zstd -T8 -6' -cf "${ARCHIVE_PATH}" -C "${BUILD_MOUNT}" graph-cache
readonly ARCHIVE_SHA256="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
readonly ARCHIVE_SIZE_BYTES="$(stat -c '%s' "${ARCHIVE_PATH}")"
readonly CONFIG_SHA256="$(sha256sum "${CONFIG_PATH}" | awk '{print $1}')"
readonly BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
    --arg release_id "${RELEASE_ID}" \
    --arg built_at "${BUILT_AT}" \
    --arg pbf_name "${PBF_NAME}" \
    --arg pbf_md5 "${PBF_MD5}" \
    --arg graphhopper_version "${GRAPHHOPPER_VERSION}" \
    --arg graphhopper_sha256 "${GRAPHHOPPER_SHA256}" \
    --arg config_sha256 "${CONFIG_SHA256}" \
    --arg archive_sha256 "${ARCHIVE_SHA256}" \
    --argjson archive_size_bytes "${ARCHIVE_SIZE_BYTES}" \
    '{
        release_id: $release_id,
        built_at: $built_at,
        source: {name: $pbf_name, md5: $pbf_md5},
        graphhopper: {version: $graphhopper_version, sha256: $graphhopper_sha256},
        config_sha256: $config_sha256,
        archive: {key: "graph-cache.tar.zst", sha256: $archive_sha256, size_bytes: $archive_size_bytes},
        validations: ["urban", "rural", "interstate", "cross-country", "turn-restrictions"]
    }' > "${MANIFEST_PATH}"

write_progress upload 90 uploading-artifact
aws s3 cp --region "${AWS_REGION}" --no-progress "${ARCHIVE_PATH}" "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/graph-cache.tar.zst"
aws s3 cp --region "${AWS_REGION}" --no-progress "${MANIFEST_PATH}" "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/manifest.json" --content-type application/json
aws s3 cp --region "${AWS_REGION}" --no-progress "${CONFIG_PATH}" "s3://${ARTIFACT_BUCKET}/${RELEASE_PREFIX}/build-config.yml" --content-type application/yaml

write_progress complete 100 artifact-uploaded
publish_telemetry
echo "BUILD_OK operation=${OPERATION_VERSION} release=${RELEASE_ID} archive_bytes=${ARCHIVE_SIZE_BYTES}"
