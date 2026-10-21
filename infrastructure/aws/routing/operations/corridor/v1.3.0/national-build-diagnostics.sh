#!/usr/bin/env bash

build_resource_snapshot() (
    trap - ERR
    set +e
    date -u +%Y-%m-%dT%H:%M:%SZ
    free -m
    df -h / "${BUILD_DIAGNOSTIC_MOUNT}"
    df -i / "${BUILD_DIAGNOSTIC_MOUNT}"
    ps -eo pid,comm,rss,pcpu,pmem --sort=-rss | head -n 12
    for filename in /proc/pressure/memory /proc/pressure/io /sys/fs/cgroup/memory.events; do
        if [[ -r "${filename}" ]]; then
            printf '%s\n' "${filename}"
            cat "${filename}"
        fi
    done
    return 0
)

upload_build_diagnostics() {
    AWS_MAX_ATTEMPTS=2 aws s3 sync "${BUILD_DIAGNOSTIC_DIR}" "${BUILD_DIAGNOSTIC_DESTINATION}/diagnostics/" \
        --region us-east-1 --no-progress --only-show-errors --cli-connect-timeout 10 --cli-read-timeout 30
}

record_build_failure() {
    if [[ -z "${BUILD_FAILED_COMMAND:-}" ]]; then
        BUILD_FAILED_LINE="$2"
        BUILD_FAILED_COMMAND="$3"
        printf 'NATIONAL_CORRIDOR_ERROR exit=%s line=%s command=%s\n' "$1" "$2" "$3" >&2
    fi
}

start_build_diagnostics() {
    local interval="${4:-60}"
    [[ "${interval}" =~ ^[1-9][0-9]*$ ]] || return 2
    BUILD_DIAGNOSTIC_DIR="$1"
    BUILD_DIAGNOSTIC_MOUNT="$2"
    BUILD_DIAGNOSTIC_DESTINATION="$3"
    BUILD_FAILED_COMMAND=''
    BUILD_FAILED_LINE=0
    mkdir -p "${BUILD_DIAGNOSTIC_DIR}"
    exec 3>&1 4>&2
    exec > >(tee -a "${BUILD_DIAGNOSTIC_DIR}/build.log" >&3) 2>&1
    BUILD_LOGGER_PID=$!
    trap 'record_build_failure "$?" "$LINENO" "$BASH_COMMAND"' ERR
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -XX:+ExitOnOutOfMemoryError -XX:ErrorFile=${BUILD_DIAGNOSTIC_DIR}/hs_err_pid%p.log -Xlog:gc*:file=${BUILD_DIAGNOSTIC_DIR}/java-gc.log:time,uptime,level,tags:filecount=3,filesize=16m"
    build_resource_snapshot >> "${BUILD_DIAGNOSTIC_DIR}/resources.log" 2>&1
    (
        trap - EXIT ERR
        trap 'kill "${BUILD_DIAGNOSTIC_SLEEP_PID:-}" 2>/dev/null || true; exit 0' TERM
        while true; do
            sleep "${interval}" &
            BUILD_DIAGNOSTIC_SLEEP_PID=$!
            wait "${BUILD_DIAGNOSTIC_SLEEP_PID}" || exit 0
            build_resource_snapshot >> "${BUILD_DIAGNOSTIC_DIR}/resources.log" 2>&1
            upload_build_diagnostics || true
        done
    ) >/dev/null 2>&1 3>&- 4>&- &
    BUILD_RESOURCE_MONITOR_PID=$!
}

finish_build_diagnostics() {
    local exit_code="$1" phase="$2" release="$3"
    kill "${BUILD_RESOURCE_MONITOR_PID}" 2>/dev/null || true
    wait "${BUILD_RESOURCE_MONITOR_PID}" 2>/dev/null || true
    build_resource_snapshot >> "${BUILD_DIAGNOSTIC_DIR}/resources.log" 2>&1
    journalctl -k --since '-30 minutes' --no-pager > "${BUILD_DIAGNOSTIC_DIR}/kernel.log" 2>&1 || true
    if (( exit_code != 0 )); then
        jq -nc --arg release "${release}" --arg phase "${phase}" --argjson exit_code "${exit_code}" \
            --arg failed_command "${BUILD_FAILED_COMMAND}" --argjson failed_line "${BUILD_FAILED_LINE}" \
            '{release:$release,phase:$phase,exit_code:$exit_code,failed_command:$failed_command,failed_line:$failed_line}' \
            > "${BUILD_DIAGNOSTIC_DIR}/failure.json"
    fi
    exec 1>&3 2>&4
    wait "${BUILD_LOGGER_PID}" || true
    if ! upload_build_diagnostics; then
        printf 'WARNING: diagnostic upload failed; local evidence is in %s\n' "${BUILD_DIAGNOSTIC_DIR}" >&2
    fi
    if ! AWS_MAX_ATTEMPTS=2 aws s3 cp "${BUILD_DIAGNOSTIC_DIR}/build.log" "${BUILD_DIAGNOSTIC_DESTINATION}/build.log" \
        --region us-east-1 --no-progress --only-show-errors --content-type text/plain \
        --cli-connect-timeout 10 --cli-read-timeout 30; then
        printf 'WARNING: build log upload failed\n' >&2
    fi
    return 0
}
