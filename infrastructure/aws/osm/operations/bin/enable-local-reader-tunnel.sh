#!/usr/bin/env bash

set -Eeuo pipefail

if (( EUID != 0 )); then
    echo 'ERROR: local reader tunnel authorization must run as root' >&2
    exit 1
fi

readonly DAF_OSM_ENV=/etc/daf-osm/daf-osm.env

if [[ ! -r "${DAF_OSM_ENV}" ]]; then
    echo "ERROR: missing ${DAF_OSM_ENV}" >&2
    exit 1
fi

# shellcheck source=/dev/null
source "${DAF_OSM_ENV}"

readonly POSTGRESQL_DATA_PATH="${DATA_MOUNT_PATH}/postgresql/data"
readonly CLIENT_AUTHENTICATION="${POSTGRESQL_DATA_PATH}/pg_hba.conf"
readonly CLIENT_AUTHENTICATION_BACKUP="${CLIENT_AUTHENTICATION}.pre-local-reader-tunnel"
readonly IPV4_RULE="hostssl ${DATABASE_NAME} osm_publisher 127.0.0.1/32            scram-sha-256"
readonly IPV6_RULE="hostssl ${DATABASE_NAME} osm_publisher ::1/128                 scram-sha-256"

[[ -s "${CLIENT_AUTHENTICATION}" ]] \
    || { echo "ERROR: missing ${CLIENT_AUTHENTICATION}" >&2; exit 1; }

if grep --fixed-strings --line-regexp --quiet "${IPV4_RULE}" "${CLIENT_AUTHENTICATION}" \
    && grep --fixed-strings --line-regexp --quiet "${IPV6_RULE}" "${CLIENT_AUTHENTICATION}"; then
    echo 'Local OSM reader tunnel authorization is already enabled.'
    exit 0
fi

if [[ ! -e "${CLIENT_AUTHENTICATION_BACKUP}" ]]; then
    install --mode=0600 --owner=postgres --group=postgres \
        "${CLIENT_AUTHENTICATION}" \
        "${CLIENT_AUTHENTICATION_BACKUP}"
fi

candidate="$(mktemp "${CLIENT_AUTHENTICATION}.local-reader-tunnel.XXXXXX")"
authentication_file_replaced=false

cleanup()
{
    rm -f "${candidate}"
}

rollback_on_error()
{
    local exit_code=$?

    trap - ERR

    if [[ "${authentication_file_replaced}" == true ]]; then
        install --mode=0600 --owner=postgres --group=postgres \
            "${CLIENT_AUTHENTICATION_BACKUP}" \
            "${CLIENT_AUTHENTICATION}"
        systemctl reload postgresql.service || true
    fi

    exit "${exit_code}"
}

trap cleanup EXIT
trap rollback_on_error ERR

awk \
    -v database_name="${DATABASE_NAME}" \
    -v ipv4_rule="${IPV4_RULE}" \
    -v ipv6_rule="${IPV6_RULE}" \
    '
    $1 == "hostssl" && $2 == database_name && $3 == "osm_publisher" && ($4 == "127.0.0.1/32" || $4 == "::1/128") {
        next
    }
    $1 == "hostssl" && $2 == database_name && $3 == "osm_publisher" && inserted == 0 {
        print ipv4_rule
        print ipv6_rule
        inserted = 1
    }
    { print }
    END {
        if (inserted == 0) {
            exit 42
        }
    }
    ' "${CLIENT_AUTHENTICATION}" > "${candidate}" \
    || { echo 'ERROR: application reader rule was not found' >&2; exit 1; }

chown postgres:postgres "${candidate}"
chmod 0600 "${candidate}"
mv --force "${candidate}" "${CLIENT_AUTHENTICATION}"
authentication_file_replaced=true

authentication_errors="$(runuser --user postgres -- \
    psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
        --dbname=postgres \
        --command="SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;")" \
    || authentication_errors=1

if [[ "${authentication_errors}" != 0 ]]; then
    install --mode=0600 --owner=postgres --group=postgres \
        "${CLIENT_AUTHENTICATION_BACKUP}" \
        "${CLIENT_AUTHENTICATION}"
    authentication_file_replaced=false
    echo 'ERROR: PostgreSQL rejected the updated client authentication file; restored backup' >&2
    exit 1
fi

systemctl reload postgresql.service
systemctl is-active --quiet postgresql.service

grep --fixed-strings --line-regexp --quiet "${IPV4_RULE}" "${CLIENT_AUTHENTICATION}"
grep --fixed-strings --line-regexp --quiet "${IPV6_RULE}" "${CLIENT_AUTHENTICATION}"
authentication_file_replaced=false
trap - ERR

echo 'Enabled loopback-only OSM reader access for SSM port forwarding.'
