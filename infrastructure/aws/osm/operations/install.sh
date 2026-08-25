#!/usr/bin/env bash
set -Eeuo pipefail

readonly FINAL_ARTIFACT_ROOT="${1:?Artifact root is required}"
readonly DATABASE_ENDPOINT=database.daf-osm.internal

systemctl()
{
    local argument
    local -a filtered_arguments=()

    for argument in "$@"; do
        if [[ "${argument}" != daf-osm-backup.timer ]]; then
            filtered_arguments+=("${argument}")
        fi
    done

    command /usr/bin/systemctl "${filtered_arguments[@]}"
}

# shellcheck source=/dev/null
source "${FINAL_ARTIFACT_ROOT}/operations/install-core.sh" "${FINAL_ARTIFACT_ROOT}"

[[ "${DATABASE_ENDPOINT}" =~ ^[a-z0-9.-]+$ ]] \
    || { log 'ERROR: invalid database TLS endpoint' >&2; exit 1; }

openssl req -new -x509 -days 825 -nodes \
    -subj "/CN=${DATABASE_ENDPOINT}" \
    -addext "subjectAltName=DNS:${DATABASE_ENDPOINT}" \
    -keyout "${POSTGRESQL_DATA_PATH}/server.key.new" \
    -out "${POSTGRESQL_DATA_PATH}/server.crt.new"
chown postgres:postgres \
    "${POSTGRESQL_DATA_PATH}/server.key.new" \
    "${POSTGRESQL_DATA_PATH}/server.crt.new"
chmod 0600 "${POSTGRESQL_DATA_PATH}/server.key.new"
chmod 0644 "${POSTGRESQL_DATA_PATH}/server.crt.new"
mv --force "${POSTGRESQL_DATA_PATH}/server.key.new" "${POSTGRESQL_DATA_PATH}/server.key"
mv --force "${POSTGRESQL_DATA_PATH}/server.crt.new" "${POSTGRESQL_DATA_PATH}/server.crt"

openssl x509 \
    -in "${POSTGRESQL_DATA_PATH}/server.crt" \
    -noout \
    -checkhost "${DATABASE_ENDPOINT}" \
    >/dev/null
command /usr/bin/systemctl restart postgresql.service

if command /usr/bin/systemctl is-enabled --quiet daf-osm-backup.timer; then
    log 'ERROR: backup timer must remain disabled until the separately approved backup phase' >&2
    exit 1
fi

log "TLS certificate covers ${DATABASE_ENDPOINT}; backup timer remains disabled pending approval"
