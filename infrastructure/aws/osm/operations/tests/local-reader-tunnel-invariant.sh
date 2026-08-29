#!/usr/bin/env bash

set -Eeuo pipefail

readonly OPERATIONS_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly INSTALLER="${OPERATIONS_DIRECTORY}/install-core.sh"
readonly ENABLER="${OPERATIONS_DIRECTORY}/bin/enable-local-reader-tunnel.sh"
readonly IPV4_CONTRACT='hostssl ${DATABASE_NAME} osm_publisher 127.0.0.1/32            scram-sha-256'
readonly IPV6_CONTRACT='hostssl ${DATABASE_NAME} osm_publisher ::1/128                 scram-sha-256'

[[ "$(grep --fixed-strings --count "${IPV4_CONTRACT}" "${INSTALLER}")" == 1 ]] \
    || { echo 'Installer must authorize exactly one IPv4 loopback reader' >&2; exit 1; }
[[ "$(grep --fixed-strings --count "${IPV6_CONTRACT}" "${INSTALLER}")" == 1 ]] \
    || { echo 'Installer must authorize exactly one IPv6 loopback reader' >&2; exit 1; }

for contract in \
    'readonly CLIENT_AUTHENTICATION_BACKUP="${CLIENT_AUTHENTICATION}.pre-local-reader-tunnel"' \
    'pg_hba_file_rules WHERE error IS NOT NULL' \
    'systemctl reload postgresql.service' \
    'systemctl is-active --quiet postgresql.service'; do
    grep --fixed-strings --quiet "${contract}" "${ENABLER}" \
        || { echo "Local tunnel enabler is missing: ${contract}" >&2; exit 1; }
done

echo 'Local OSM reader tunnel authorization invariant passed.'
