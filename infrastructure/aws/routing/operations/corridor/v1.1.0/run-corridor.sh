#!/usr/bin/env bash
set -euo pipefail
[[ $# == 3 ]] || { echo 'Usage: run-corridor.sh RELEASE PBF_NAME PBF_MD5' >&2; exit 1; }
readonly RELEASE="$1" PBF_NAME="$2" PBF_MD5="$3"
[[ "${RELEASE}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || exit 1
[[ "${PBF_NAME}" =~ ^us-[0-9]{6}\.osm\.pbf$ && "${PBF_MD5}" =~ ^[a-f0-9]{32}$ ]] || exit 1
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MOUNT=/mnt/daf-build
readonly GRAPH_JAR="${MOUNT}/download/graphhopper-web-11.0.jar"
readonly GRAPH_SHA=b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def
readonly OUTPUT="${MOUNT}/output/national-corridor-${RELEASE}"
readonly SCRATCH="${MOUNT}/national-corridor-scratch-${RELEASE}"
readonly READBACK="${MOUNT}/output/national-corridor-readback-${RELEASE}"
printf '%s  %s\n' "${GRAPH_SHA}" "${GRAPH_JAR}" | sha256sum --check --status
printf '%s  %s\n' "${PBF_MD5}" "${MOUNT}/download/${PBF_NAME}" | md5sum --check --status
# Reuse the verified national source without modifying the routing graph.
dnf install -y java-17-amazon-corretto-devel nodejs
install -d "${ROOT}/classes"
javac --release 17 -cp "${GRAPH_JAR}" -d "${ROOT}/classes" "${ROOT}/RoadCorridorExporter.java"
jar --create --date=2026-10-18T00:00:00Z --file "${ROOT}/exporter.jar" -C "${ROOT}/classes" .
readonly EXPORTER_SHA="$(sha256sum "${ROOT}/exporter.jar" | awk '{print $1}')"
java -Xms4g -Xmx32g -Dfile.encoding=UTF-8 -cp "${ROOT}/exporter.jar:${GRAPH_JAR}" RoadCorridorExporter \
    "${MOUNT}/download/${PBF_NAME}" "${OUTPUT}" "${SCRATCH}" "${RELEASE}" "${PBF_MD5}" "${GRAPH_SHA}" "${EXPORTER_SHA}"
node "${ROOT}/publish-and-promote.mjs" "${OUTPUT}" "${READBACK}" "${RELEASE}" "${PBF_MD5}" daf-routing-graphs-326364278889-us-east-1
