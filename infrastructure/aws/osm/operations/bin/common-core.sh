#!/usr/bin/env bash
set -Eeuo pipefail

readonly DAF_OSM_ENV=/etc/daf-osm/daf-osm.env

if [[ ! -r "${DAF_OSM_ENV}" ]]; then
    echo "Missing ${DAF_OSM_ENV}" >&2
    exit 1
fi

# shellcheck source=/dev/null
source "${DAF_OSM_ENV}"

export PGHOST="${POSTGRESQL_SOCKET_DIR}"
export PGPORT="${POSTGRESQL_PORT}"
export PGDATABASE="${DATABASE_NAME}"
export PGUSER=osm_ingest

log()
{
    printf '%s %s\n' "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die()
{
    log "ERROR: $*" >&2
    exit 1
}

require_file()
{
    [[ -s "$1" ]] || die "Required file is missing or empty: $1"
}

state_value()
{
    local state_file="$1"
    local key="$2"
    local value

    value="$(sed -n "s/^${key}=//p" "${state_file}" | tail -n 1)"
    value="${value//\\:/:}"
    printf '%s\n' "${value}"
}

state_sequence()
{
    state_value "$1" sequenceNumber
}

state_timestamp()
{
    state_value "$1" timestamp
}

psql_osm()
{
    psql --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

put_metric()
{
    local metric_name="$1"
    local value="$2"
    local unit="$3"

    aws cloudwatch put-metric-data \
        --region "${AWS_REGION}" \
        --namespace "${CLOUDWATCH_NAMESPACE}" \
        --metric-data "MetricName=${metric_name},Dimensions=[{Name=InstanceId,Value=${INSTANCE_ID}}],Value=${value},Unit=${unit}" \
        >/dev/null
}

record_http_metadata()
{
    local url="$1"
    local destination="$2"
    local headers

    headers="$(curl --fail --silent --show-error --location --head \
        --user-agent "${OSM_HTTP_USER_AGENT}" \
        --write-out '\nresolved_url=%{url_effective}\n' \
        "${url}")"

    umask 027
    printf '%s\n' "${headers}" > "${destination}"
}

download()
{
    local url="$1"
    local destination="$2"
    local partial="${destination}.partial"

    curl --fail --silent --show-error --location --retry 8 --retry-all-errors \
        --continue-at - \
        --user-agent "${OSM_HTTP_USER_AGENT}" \
        --output "${partial}" \
        "${url}"
    mv --force "${partial}" "${destination}"
}

promote_state()
{
    local pending="$1"
    local canonical="$2"
    local promoted="${canonical}.promoted"

    install --mode=0640 "${pending}" "${promoted}"
    mv --force "${promoted}" "${canonical}"
}

write_pipeline_state()
{
    local key="$1"
    local value="$2"

    psql_osm \
        --set=state_key="${key}" \
        --set=state_value="${value}" \
        --command="INSERT INTO osm_pipeline.state (state_key, state_value) VALUES (:'state_key', :'state_value') ON CONFLICT (state_key) DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = clock_timestamp();"
}

clean_stale_work_directories()
{
    local prefix="$1"

    [[ "${OSM_WORK_PATH}" == "${OSM_DATA_PATH}/work" ]] \
        || die "Refusing stale cleanup outside the configured work path"
    [[ "${prefix}" =~ ^[a-z][a-z0-9-]+$ ]] \
        || die "Invalid stale-work prefix: ${prefix}"

    find "${OSM_WORK_PATH}" \
        -xdev \
        -mindepth 1 \
        -maxdepth 1 \
        -type d \
        -name "${prefix}.*" \
        -mmin +60 \
        -exec rm --recursive --force -- {} +
}

mark_failure()
{
    local metric_name="$1"
    local exit_code="$2"

    put_metric "${metric_name}" 1 Count || true
    exit "${exit_code}"
}
