#!/usr/bin/env bash

require_external_build_root() {
    local build_root="$1"
    local external_path="${build_root#/Volumes/}"

    if [[ "$external_path" == "$build_root" || "$external_path" != */* ]]; then
        echo "Build storage must be under a mounted external volume in /Volumes: $build_root" >&2
        return 1
    fi

    if [[ "/$external_path/" == *"/../"* || "/$external_path/" == *"/./"* ]]; then
        echo "External build storage cannot contain relative path segments: $build_root" >&2
        return 1
    fi

    local volume_root="/Volumes/${external_path%%/*}"

    if ! mount | grep -F " on $volume_root " >/dev/null; then
        echo "External build volume is not mounted: $volume_root" >&2
        return 1
    fi
}

reject_internal_temp_arguments() {
    local argument

    for argument in "$@"; do
        if [[ "$argument" == *"/private/tmp"* ||
            "$argument" == *"/var/folders/"* ||
            "$argument" == "/tmp" ||
            "$argument" == /tmp/* ||
            "$argument" == *"=/tmp" ||
            "$argument" == *"=/tmp/"* ]]; then
            echo "Internal temporary paths are forbidden for native builds: $argument" >&2
            return 1
        fi
    done
}
