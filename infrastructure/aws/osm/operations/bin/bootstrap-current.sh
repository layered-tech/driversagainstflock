#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly BOOTSTRAP_MARKER="${OSM_STATE_PATH}/current-bootstrap.complete"
readonly CURRENT_STATE="${OSM_STATE_PATH}/current-replication.state"
readonly EXTRACT_PATH="${OSM_DOWNLOAD_PATH}/north-america-bootstrap.osm.pbf"
readonly CHECKSUM_PATH="${OSM_DOWNLOAD_PATH}/north-america-bootstrap.osm.pbf.md5"
readonly EXTRACT_STATE_PATH="${OSM_DOWNLOAD_PATH}/north-america-bootstrap.state.txt"
readonly HTTP_METADATA_PATH="${OSM_STATE_PATH}/current-extract-http-headers.txt"

bootstrap_status=0
/opt/daf-osm/bin/bootstrap-current-core.sh || bootstrap_status=$?

if (( bootstrap_status != 0 )); then
    if [[ -s "${EXTRACT_PATH}" && -s "${CHECKSUM_PATH}" ]]; then
        expected_md5="$(awk 'NR == 1 { print $1 }' "${CHECKSUM_PATH}")"
        if [[ ! "${expected_md5}" =~ ^[0-9a-fA-F]{32}$ ]] \
            || ! printf '%s  %s\n' "${expected_md5}" "${EXTRACT_PATH}" \
                | md5sum --check --status -; then
            rm --force -- \
                "${EXTRACT_PATH}" \
                "${EXTRACT_PATH}.partial" \
                "${CHECKSUM_PATH}" \
                "${CHECKSUM_PATH}.partial" \
                "${EXTRACT_STATE_PATH}" \
                "${EXTRACT_STATE_PATH}.partial" \
                "${HTTP_METADATA_PATH}"
        fi
    fi
    exit "${bootstrap_status}"
fi

require_file "${CURRENT_STATE}"
marker_partial="${BOOTSTRAP_MARKER}.partial"
printf 'sequence=%s\ncompleted_at=%s\n' \
    "$(state_sequence "${CURRENT_STATE}")" \
    "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" \
    > "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${BOOTSTRAP_MARKER}"
