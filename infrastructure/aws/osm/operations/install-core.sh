#!/usr/bin/env bash
set -Eeuo pipefail

readonly ARTIFACT_ROOT="${1:?Artifact root is required}"
readonly OPERATIONS_SOURCE="${ARTIFACT_ROOT}/operations"
readonly DATABASE_SOURCE="${ARTIFACT_ROOT}/database/osm2pgsql/production"

: "${AWS_REGION:?AWS_REGION is required}"
: "${DATA_MOUNT_PATH:?DATA_MOUNT_PATH is required}"
: "${POSTGRESQL_PORT:?POSTGRESQL_PORT is required}"
: "${DATABASE_NAME:?DATABASE_NAME is required}"
: "${DATABASE_CLIENT_CIDR:?DATABASE_CLIENT_CIDR is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${BACKUP_PREFIX:?BACKUP_PREFIX is required}"
: "${CLOUDWATCH_NAMESPACE:?CLOUDWATCH_NAMESPACE is required}"
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${PUBLISHER_PASSWORD:?PUBLISHER_PASSWORD is required}"

readonly POSTGRESQL_DATA_PATH="${DATA_MOUNT_PATH}/postgresql/data"
readonly SERVICE_DATA_PATH="${DATA_MOUNT_PATH}/osm"
readonly POSTGRESQL_SOCKET_DIR=/var/run/postgresql
readonly OSM2PGSQL_COMMIT=a32140835bf919cd3f0a15478db320b05b59a5ab
readonly OSMIUM_TOOL_COMMIT=e2afb9420e489fa5c300b7e4b25b03f235602b93
readonly LIBOSMIUM_COMMIT=97dccf105391d410701ae8bd52170dc0ee041373
readonly MINIMUM_AL2023_RELEASE=2023.9.20251117
readonly INSTALL_LOCK_PATH=/run/daf-osm-install.lock

build_root=''

log()
{
    printf '%s %s\n' "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

acquire_install_lock()
{
    exec 9>"${INSTALL_LOCK_PATH}"
    if ! flock --nonblock 9; then
        log "ERROR: another OSM runtime installation holds ${INSTALL_LOCK_PATH}" >&2
        exit 75
    fi
}

acquire_replication_locks()
{
    install --directory --mode=0755 /run/daf-osm
    exec 10> /run/daf-osm/backup.lock
    flock 10
    exec 8> /run/daf-osm/current.lock
    flock 8
    exec 7> /run/daf-osm/history.lock
    flock 7
    exec 6> /run/daf-osm/global.lock
    flock 6
    exec 5> /run/daf-osm/global-current.lock
    flock 5
    exec 4> /run/daf-osm/global-history.lock
    flock 4
}

assert_supported_system_release()
{
    local system_release
    local earliest_release

    [[ -r /etc/system-release ]] \
        || { log 'ERROR: /etc/system-release is unavailable' >&2; return 1; }
    system_release="$(sed -nE 's/^Amazon Linux release ([0-9]+([.][0-9]+)+).*$/\1/p' /etc/system-release)"
    [[ "${system_release}" =~ ^[0-9]+([.][0-9]+)+$ ]] \
        || { log 'ERROR: host is not a recognized Amazon Linux 2023 release' >&2; return 1; }

    earliest_release="$(printf '%s\n%s\n' "${MINIMUM_AL2023_RELEASE}" "${system_release}" \
        | sort --version-sort \
        | head --lines=1)"
    [[ "${earliest_release}" == "${MINIMUM_AL2023_RELEASE}" ]] \
        || { log "ERROR: Amazon Linux ${system_release} is older than required ${MINIMUM_AL2023_RELEASE}" >&2; return 1; }
}

cleanup_build_root()
{
    if [[ -n "${build_root}" && -d "${build_root}" ]]; then
        rm --recursive --force -- "${build_root}"
    fi
}

trap cleanup_build_root EXIT

install_packages()
{
    local package_plan
    local package_plan_status=0
    local -a runtime_packages=(
        amazon-cloudwatch-agent
        awscli
        boost-devel
        bzip2-devel
        cmake
        curl-minimal
        expat-devel
        gcc-c++
        git
        gzip
        jq
        json-devel
        libpq-devel
        lua-devel
        make
        nvme-cli
        openssl
        postgresql17
        postgresql17-contrib
        postgresql17-postgis
        postgresql17-server
        protozero-devel
        python3
        python3-devel
        python3-pip
        tar
        util-linux
        xfsprogs
        zlib-devel
    )

    assert_supported_system_release
    dnf install --assumeyes spal-release

    package_plan="$(LC_ALL=C dnf install --assumeno "${runtime_packages[@]}" 2>&1)" \
        || package_plan_status=$?
    printf '%s\n' "${package_plan}"

    if (( package_plan_status != 0 )); then
        if (( package_plan_status != 1 )) \
            || ! grep --fixed-strings --quiet 'Dependencies resolved.' <<< "${package_plan}" \
            || ! grep --fixed-strings --quiet 'Operation aborted.' <<< "${package_plan}" \
            || grep --fixed-strings --quiet 'Problem:' <<< "${package_plan}"; then
            return "${package_plan_status}"
        fi
    fi

    LC_ALL=C dnf install --assumeyes "${runtime_packages[@]}"
}

checkout_commit()
{
    local repository_url="$1"
    local commit="$2"
    local destination="$3"

    git init --quiet "${destination}"
    git -C "${destination}" remote add origin "${repository_url}"
    git -C "${destination}" fetch --quiet --depth=1 origin "${commit}"
    git -C "${destination}" checkout --quiet --detach FETCH_HEAD
    [[ "$(git -C "${destination}" rev-parse HEAD)" == "${commit}" ]] \
        || { log "ERROR: immutable source checkout mismatch for ${repository_url}" >&2; return 1; }
}

patch_boost_discovery()
{
    local source_root="$1"
    local project_name="$2"
    local config_find="$3"
    local module_find="$4"
    local cmake_file="${source_root}/CMakeLists.txt"

    if [[ "$(grep --fixed-strings --line-regexp --count "${config_find}" "${cmake_file}" || true)" != 1 ]]; then
        log "ERROR: pinned ${project_name} Boost discovery contract changed" >&2
        return 1
    fi

    sed --in-place "s/${config_find}/${module_find}/" "${cmake_file}"
    if ! grep --fixed-strings --line-regexp --quiet "${module_find}" "${cmake_file}"; then
        log "ERROR: failed to select CMake module-mode Boost discovery for ${project_name}" >&2
        return 1
    fi
}

installed_osm_tools_are_current()
{
    local marker_path=/opt/daf-osm/source-versions
    local osm2pgsql_version_output
    local osmium_version_output

    [[ -x /usr/local/bin/osm2pgsql ]] || return 1
    [[ -x /usr/local/bin/osmium ]] || return 1
    [[ -r "${marker_path}" ]] || return 1
    [[ "$(wc --lines < "${marker_path}")" -eq 3 ]] || return 1
    grep --fixed-strings --line-regexp --quiet "osm2pgsql_commit=${OSM2PGSQL_COMMIT}" "${marker_path}" || return 1
    grep --fixed-strings --line-regexp --quiet "osmium_tool_commit=${OSMIUM_TOOL_COMMIT}" "${marker_path}" || return 1
    grep --fixed-strings --line-regexp --quiet "libosmium_commit=${LIBOSMIUM_COMMIT}" "${marker_path}" || return 1

    osm2pgsql_version_output="$(osm2pgsql --version 2>&1)" || return 1
    osmium_version_output="$(osmium --version 2>&1)" || return 1
    grep --fixed-strings --line-regexp --quiet 'osm2pgsql version 2.3.1' <<< "${osm2pgsql_version_output}" || return 1
    grep --fixed-strings --line-regexp --quiet 'osmium version 1.19.0' <<< "${osmium_version_output}" || return 1
    grep --fixed-strings --line-regexp --quiet 'libosmium version 2.23.1' <<< "${osmium_version_output}" || return 1
}

build_osm_tools()
{
    local osm2pgsql_source
    local osmium_source
    local libosmium_source
    local osm2pgsql_version_output
    local osmium_version_output

    if installed_osm_tools_are_current; then
        log 'Pinned OSM command-line tools already installed'
        return
    fi

    find /var/tmp \
        -xdev \
        -mindepth 1 \
        -maxdepth 1 \
        -type d \
        -name 'daf-osm-build.*' \
        -mmin +60 \
        -exec rm --recursive --force -- {} +

    build_root="$(mktemp --directory /var/tmp/daf-osm-build.XXXXXX)"
    osm2pgsql_source="${build_root}/osm2pgsql"
    osmium_source="${build_root}/osmium-tool"
    libosmium_source="${build_root}/libosmium"

    log 'Checking out immutable osm2pgsql 2.3.1 source'
    checkout_commit \
        https://github.com/osm2pgsql-dev/osm2pgsql.git \
        "${OSM2PGSQL_COMMIT}" \
        "${osm2pgsql_source}"
    git -C "${osm2pgsql_source}" submodule update --init --recursive --depth=1
    patch_boost_discovery \
        "${osm2pgsql_source}" \
        osm2pgsql \
        'find_package(Boost CONFIG 1.50 REQUIRED)' \
        'find_package(Boost 1.50 REQUIRED)'

    cmake \
        -S "${osm2pgsql_source}" \
        -B "${osm2pgsql_source}/build" \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_TESTS=OFF \
        -DWITH_PROJ=OFF
    cmake --build "${osm2pgsql_source}/build" --parallel "$(nproc)"
    cmake --install "${osm2pgsql_source}/build"

    log 'Checking out immutable libosmium 2.23.1 and osmium-tool 1.19.0 sources'
    checkout_commit \
        https://github.com/osmcode/libosmium.git \
        "${LIBOSMIUM_COMMIT}" \
        "${libosmium_source}"
    checkout_commit \
        https://github.com/osmcode/osmium-tool.git \
        "${OSMIUM_TOOL_COMMIT}" \
        "${osmium_source}"
    patch_boost_discovery \
        "${osmium_source}" \
        osmium-tool \
        'find_package(Boost CONFIG 1.55.0 REQUIRED COMPONENTS program_options)' \
        'find_package(Boost 1.55.0 REQUIRED COMPONENTS program_options)'

    cmake \
        -S "${osmium_source}" \
        -B "${osmium_source}/build" \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_TESTING=OFF \
        -DOSMIUM_INCLUDE_DIR="${libosmium_source}/include" \
        -DWITH_LZ4=OFF
    cmake --build "${osmium_source}/build" --parallel "$(nproc)"
    cmake --install "${osmium_source}/build"
    ldconfig

    osm2pgsql_version_output="$(osm2pgsql --version 2>&1)"
    osmium_version_output="$(osmium --version 2>&1)"
    grep --fixed-strings --line-regexp --quiet 'osm2pgsql version 2.3.1' \
        <<< "${osm2pgsql_version_output}" \
        || { log 'ERROR: installed osm2pgsql version is not exactly 2.3.1' >&2; return 1; }
    grep --fixed-strings --line-regexp --quiet 'osmium version 1.19.0' \
        <<< "${osmium_version_output}" \
        || { log 'ERROR: installed osmium-tool version is not exactly 1.19.0' >&2; return 1; }
    grep --fixed-strings --line-regexp --quiet 'libosmium version 2.23.1' \
        <<< "${osmium_version_output}" \
        || { log 'ERROR: installed libosmium version is not exactly 2.23.1' >&2; return 1; }

    install --directory --mode=0755 /opt/daf-osm
    {
        printf 'osm2pgsql_commit=%s\n' "${OSM2PGSQL_COMMIT}"
        printf 'osmium_tool_commit=%s\n' "${OSMIUM_TOOL_COMMIT}"
        printf 'libosmium_commit=%s\n' "${LIBOSMIUM_COMMIT}"
    } > /opt/daf-osm/source-versions
    chmod 0644 /opt/daf-osm/source-versions

    cleanup_build_root
    build_root=''
}

install_runtime_files()
{
    install --directory --mode=0755 /opt/daf-osm/bin /opt/daf-osm/database
    install --mode=0755 "${OPERATIONS_SOURCE}"/bin/*.sh /opt/daf-osm/bin/
    install --mode=0755 "${OPERATIONS_SOURCE}"/bin/*.py /opt/daf-osm/bin/
    install --mode=0644 "${DATABASE_SOURCE}"/*.sql /opt/daf-osm/database/
    install --mode=0644 "${DATABASE_SOURCE}"/*.lua /opt/daf-osm/database/

    install --directory --mode=0755 /etc/systemd/system
    install --mode=0644 "${OPERATIONS_SOURCE}"/systemd/*.service /etc/systemd/system/
    install --mode=0644 "${OPERATIONS_SOURCE}"/systemd/*.timer /etc/systemd/system/

    install --directory --owner=root --group=osm_ingest --mode=0750 /etc/daf-osm
    sed "s|__DATA_MOUNT_PATH__|${DATA_MOUNT_PATH}|g" \
        "${OPERATIONS_SOURCE}/cloudwatch-agent.json" \
        > /etc/daf-osm/cloudwatch-agent.json
    chmod 0644 /etc/daf-osm/cloudwatch-agent.json
}

create_service_user_and_paths()
{
    if ! getent passwd osm_ingest >/dev/null; then
        useradd --system \
            --home-dir "${SERVICE_DATA_PATH}/home" \
            --create-home \
            --shell /sbin/nologin \
            osm_ingest
    fi

    chmod 0711 "${DATA_MOUNT_PATH}"
    install --directory --owner=postgres --group=postgres --mode=0700 "${POSTGRESQL_DATA_PATH}"
    install --directory --owner=osm_ingest --group=osm_ingest --mode=0750 \
        /run/daf-osm \
        "${SERVICE_DATA_PATH}" \
        "${SERVICE_DATA_PATH}/backups" \
        "${SERVICE_DATA_PATH}/downloads" \
        "${SERVICE_DATA_PATH}/global-replication-spool" \
        "${SERVICE_DATA_PATH}/state" \
        "${SERVICE_DATA_PATH}/work"
    chown osm_ingest:osm_ingest \
        /run/daf-osm/backup.lock \
        /run/daf-osm/current.lock \
        /run/daf-osm/history.lock \
        /run/daf-osm/global.lock \
        /run/daf-osm/global-current.lock \
        /run/daf-osm/global-history.lock
    chmod 0640 \
        /run/daf-osm/backup.lock \
        /run/daf-osm/current.lock \
        /run/daf-osm/history.lock \
        /run/daf-osm/global.lock \
        /run/daf-osm/global-current.lock \
        /run/daf-osm/global-history.lock
    install --directory --owner=osm_ingest --group=osm_ingest --mode=0750 /var/log/daf-osm
}

write_runtime_environment()
{
    local environment_path=/etc/daf-osm/daf-osm.env

    install --mode=0640 --owner=root --group=osm_ingest \
        "${OPERATIONS_SOURCE}/daf-osm.env" \
        "${environment_path}"

    {
        printf 'AWS_REGION=%q\n' "${AWS_REGION}"
        printf 'DATA_MOUNT_PATH=%q\n' "${DATA_MOUNT_PATH}"
        printf 'OSM_DATA_PATH=%q\n' "${SERVICE_DATA_PATH}"
        printf 'OSM_DOWNLOAD_PATH=%q\n' "${SERVICE_DATA_PATH}/downloads"
        printf 'OSM_STATE_PATH=%q\n' "${SERVICE_DATA_PATH}/state"
        printf 'OSM_WORK_PATH=%q\n' "${SERVICE_DATA_PATH}/work"
        printf 'OSM_BACKUP_PATH=%q\n' "${SERVICE_DATA_PATH}/backups"
        printf 'POSTGRESQL_SOCKET_DIR=%q\n' "${POSTGRESQL_SOCKET_DIR}"
        printf 'POSTGRESQL_PORT=%q\n' "${POSTGRESQL_PORT}"
        printf 'DATABASE_NAME=%q\n' "${DATABASE_NAME}"
        printf 'BACKUP_BUCKET=%q\n' "${BACKUP_BUCKET}"
        printf 'BACKUP_PREFIX=%q\n' "${BACKUP_PREFIX}"
        printf 'CLOUDWATCH_NAMESPACE=%q\n' "${CLOUDWATCH_NAMESPACE}"
        printf 'INSTANCE_ID=%q\n' "${INSTANCE_ID}"
        printf 'OSM2PGSQL_PROCESSES=%q\n' "$(nproc)"
    } >> "${environment_path}"
}

install_python_runtime()
{
    local pyosmium_version

    pyosmium_version="$(sed -n 's/^PYOSMIUM_VERSION=//p' "${OPERATIONS_SOURCE}/daf-osm.env")"
    [[ "${pyosmium_version}" == 4.3.1 ]] \
        || { log "ERROR: unsupported pyosmium version ${pyosmium_version}" >&2; return 1; }

    python3 -m venv /opt/daf-osm/venv
    /opt/daf-osm/venv/bin/pip install \
        --disable-pip-version-check \
        --no-cache-dir \
        "osmium==${pyosmium_version}"
    /opt/daf-osm/venv/bin/python -c \
        'import importlib.metadata; assert importlib.metadata.version("osmium") == "4.3.1"'
}

configure_postgresql()
{
    local postgresql_configuration="${POSTGRESQL_DATA_PATH}/postgresql.conf"
    local client_authentication="${POSTGRESQL_DATA_PATH}/pg_hba.conf"

    install --directory --mode=0755 /etc/systemd/system/postgresql.service.d
    {
        printf '[Unit]\n'
        printf 'RequiresMountsFor=%s\n' "${DATA_MOUNT_PATH}"
        printf '\n[Service]\n'
        printf 'Environment=PGDATA=%s\n' "${POSTGRESQL_DATA_PATH}"
    } > /etc/systemd/system/postgresql.service.d/daf-osm.conf

    if [[ ! -s "${POSTGRESQL_DATA_PATH}/PG_VERSION" ]]; then
        runuser --user postgres -- initdb \
            --auth-local=peer \
            --auth-host=scram-sha-256 \
            --data-checksums \
            --encoding=UTF8 \
            --pgdata="${POSTGRESQL_DATA_PATH}"
    fi

    if ! grep --quiet '^# daf-osm$' "${postgresql_configuration}"; then
        cat >> "${postgresql_configuration}" <<POSTGRESQL_CONFIGURATION
# daf-osm
listen_addresses = '*'
port = ${POSTGRESQL_PORT}
password_encryption = 'scram-sha-256'
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
shared_buffers = '4GB'
effective_cache_size = '12GB'
maintenance_work_mem = '1GB'
wal_compression = on
checkpoint_completion_target = 0.9
log_min_duration_statement = 5000
log_checkpoints = on
log_connections = on
log_disconnections = on
POSTGRESQL_CONFIGURATION
    fi

    if [[ ! -s "${POSTGRESQL_DATA_PATH}/server.key" ]]; then
        openssl req -new -x509 -days 825 -nodes \
            -subj '/CN=daf-osm.internal' \
            -keyout "${POSTGRESQL_DATA_PATH}/server.key" \
            -out "${POSTGRESQL_DATA_PATH}/server.crt"
        chown postgres:postgres \
            "${POSTGRESQL_DATA_PATH}/server.key" \
            "${POSTGRESQL_DATA_PATH}/server.crt"
        chmod 0600 "${POSTGRESQL_DATA_PATH}/server.key"
        chmod 0644 "${POSTGRESQL_DATA_PATH}/server.crt"
    fi

    cat > "${client_authentication}" <<CLIENT_AUTHENTICATION
local   all              postgres                              peer
local   ${DATABASE_NAME} osm_ingest                            peer
hostssl ${DATABASE_NAME} osm_publisher 127.0.0.1/32            scram-sha-256
hostssl ${DATABASE_NAME} osm_publisher ::1/128                 scram-sha-256
hostssl ${DATABASE_NAME} osm_publisher ${DATABASE_CLIENT_CIDR} scram-sha-256
CLIENT_AUTHENTICATION
    chown postgres:postgres "${client_authentication}"
    chmod 0600 "${client_authentication}"

    systemctl daemon-reload
    systemctl enable --now postgresql.service
}

create_database_contract()
{
    PUBLISHER_PASSWORD="${PUBLISHER_PASSWORD}" \
        runuser --preserve-environment --user postgres -- \
        psql --no-psqlrc --set=ON_ERROR_STOP=1 \
        --set=database_name="${DATABASE_NAME}" <<'ROLE_SQL'
\getenv publisher_password PUBLISHER_PASSWORD
SELECT 'CREATE ROLE osm_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osm_owner')
\gexec
SELECT 'CREATE ROLE osm_ingest LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osm_ingest')
\gexec
SELECT 'CREATE ROLE osm_publisher LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osm_publisher')
\gexec
ALTER ROLE osm_publisher PASSWORD :'publisher_password';
SELECT format('CREATE DATABASE %I OWNER osm_owner', :'database_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database_name')
\gexec
ROLE_SQL

    runuser --user postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
        --dbname="${DATABASE_NAME}" \
        --set=database_name="${DATABASE_NAME}" \
        --file=/opt/daf-osm/database/schema.sql

    runuser --user postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
        --dbname="${DATABASE_NAME}" \
        --set=database_name="${DATABASE_NAME}" <<'DATABASE_SQL'
ALTER ROLE osm_ingest IN DATABASE :"database_name"
    SET search_path = osm_ingest, osm_pipeline, osm_current, osm_history, public;
ALTER ROLE osm_publisher IN DATABASE :"database_name"
    SET search_path = osm_current, osm_history, public;
DATABASE_SQL
}

enable_operations()
{
    systemctl disable --now \
        daf-osm-current-update.timer \
        daf-osm-history-update.timer \
        2>/dev/null || true
    rm --force -- \
        /etc/systemd/system/daf-osm-current-update.service \
        /etc/systemd/system/daf-osm-current-update.timer \
        /etc/systemd/system/daf-osm-history-update.service \
        /etc/systemd/system/daf-osm-history-update.timer
    systemctl daemon-reload
    systemctl enable \
        daf-osm-metrics.timer \
        daf-osm-backup.timer
    if [[ -s "${SERVICE_DATA_PATH}/state/global-stack.complete" ]]; then
        systemctl enable daf-osm-global-update.timer
    else
        systemctl disable --now daf-osm-global-update.timer
    fi

    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
        -a fetch-config \
        -m ec2 \
        -s \
        -c file:/etc/daf-osm/cloudwatch-agent.json

    systemctl restart \
        daf-osm-metrics.timer \
        daf-osm-backup.timer
    if [[ -s "${SERVICE_DATA_PATH}/state/global-stack.complete" ]]; then
        systemctl restart daf-osm-global-update.timer
    fi
}

main()
{
    log 'Installing AL2023 and SPAL packages'
    install_packages
    log 'Building pinned OSM command-line tools'
    build_osm_tools
    create_service_user_and_paths
    install_runtime_files
    write_runtime_environment
    install_python_runtime
    configure_postgresql
    create_database_contract
    enable_operations
    log 'OSM runtime installation complete; data bootstraps await separate approved SSM starts'
}

acquire_install_lock
acquire_replication_locks
main "$@"
