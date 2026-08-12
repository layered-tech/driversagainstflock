#!/usr/bin/env bash

set -euo pipefail

readonly GRAPHHOPPER_VERSION="11.0"
readonly GRAPHHOPPER_SHA256="b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def"
readonly JAR_PATH="/opt/graphhopper/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"
readonly GRAPH_MOUNT="/var/lib/graphhopper"

fail() {
    echo "VERIFY_FAILED check=$1" >&2
    exit 1
}

[[ "$(uname -m)" == "aarch64" ]] || fail architecture
[[ "$(findmnt -nro FSTYPE "${GRAPH_MOUNT}")" == "xfs" ]] || fail graph-filesystem
findmnt -nro OPTIONS "${GRAPH_MOUNT}" | tr ',' '\n' | grep -qx nodev || fail graph-nodev
findmnt -nro OPTIONS "${GRAPH_MOUNT}" | tr ',' '\n' | grep -qx nosuid || fail graph-nosuid
printf '%s  %s\n' "${GRAPHHOPPER_SHA256}" "${JAR_PATH}" | sha256sum --check --status || fail graphhopper-checksum
java -version 2>&1 | grep -q '17\.' || fail java-version
grep -qF 'graph.dataaccess.default_type: MMAP_RO' /etc/graphhopper/config.yml || fail read-only-mmap
grep -qF 'appenders: []' /etc/graphhopper/config.yml || fail request-log-disabled
grep -qF 'access_log off;' /etc/nginx/conf.d/daf-routing.conf || fail nginx-access-log-disabled
[[ "$(stat -c '%a' /run/daf-routing-nginx-auth.conf)" == "600" ]] || fail token-file-mode
nginx -t >/dev/null 2>&1 || fail nginx-config
systemctl is-active --quiet amazon-ssm-agent || fail ssm-agent
systemctl is-active --quiet nginx.service || fail nginx-service
curl --fail --silent --show-error --output /dev/null http://127.0.0.1:8080/health/live || fail nginx-live

unauthorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/route)"
[[ "${unauthorized_status}" == "401" ]] || fail bearer-auth

if [[ -f "${GRAPH_MOUNT}/releases/current/graph-cache/properties" ]]; then
    systemctl is-active --quiet graphhopper.service || fail graphhopper-service
    graph_state="active"
else
    ! systemctl is-active --quiet graphhopper.service || fail graphhopper-without-artifact
    graph_state="pending-artifact"
fi

echo "VERIFY_OK graphhopper=${GRAPHHOPPER_VERSION} graph=${graph_state} ssm=active nginx=active auth=required logs=coordinate-free"
