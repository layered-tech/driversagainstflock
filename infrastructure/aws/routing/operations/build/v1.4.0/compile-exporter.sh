#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo 'Usage: compile-exporter.sh PINNED_GRAPHHOPPER_JAR OUTPUT_JAR' >&2
    exit 1
fi

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PINNED_SHA256=b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def
printf '%s  %s\n' "${PINNED_SHA256}" "$1" | shasum -a 256 --check --status
[[ ! -e "$2" ]] || { echo 'Refusing to overwrite an exporter JAR' >&2; exit 1; }
readonly CLASSES="$(mktemp -d)"
trap 'rm -rf "${CLASSES}"' EXIT
javac --release 17 -cp "$1" -d "${CLASSES}" "${SOURCE_DIR}/RoadCorridorExporter.java"
# Fixed ZIP timestamps make identical source builds reproducible on the same JDK.
jar --create --date=2026-10-18T00:00:00Z --file "$2" -C "${CLASSES}" .
shasum -a 256 "$2"
