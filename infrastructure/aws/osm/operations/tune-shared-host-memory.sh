#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${EUID}" == 0 ]] || { echo 'Memory tuning requires root' >&2; exit 1; }
component="${1:-}"
[[ "${component}" == graphhopper || "${component}" == database ]] \
    || { echo 'Usage: tune-shared-host-memory.sh graphhopper|database' >&2; exit 1; }

readonly BACKUP_DIRECTORY="/var/lib/daf-osm/memory-tuning/$(date --utc +%Y%m%dT%H%M%SZ)-${component}"
install --directory --mode=0700 "${BACKUP_DIRECTORY}"
exec 11> /run/daf-memory-tuning.lock
flock --nonblock 11 || { echo 'Another memory tuning operation is active' >&2; exit 1; }

timers_to_restart=()
configuration_path=''
drop_in_path=/etc/systemd/system/graphhopper.service.d/memory.conf
changed=false

restore_timers() {
    if (( ${#timers_to_restart[@]} > 0 )); then
        systemctl start "${timers_to_restart[@]}"
    fi
}

service_is_running() {
    case "$(systemctl show "$1" --property=ActiveState --value)" in
        active|activating|deactivating|reloading) return 0 ;;
        *) return 1 ;;
    esac
}

finish() {
    local exit_code=$?
    trap - EXIT
    if (( exit_code != 0 )) && [[ "${changed}" == true ]]; then
        if [[ "${component}" == graphhopper ]]; then
            if [[ -f "${BACKUP_DIRECTORY}/memory.conf" ]]; then
                cp -a "${BACKUP_DIRECTORY}/memory.conf" "${drop_in_path}"
            else
                rm --force "${drop_in_path}"
            fi
            systemctl daemon-reload
            systemctl restart graphhopper.service || true
        else
            cp -a "${BACKUP_DIRECTORY}/postgresql.conf" "${configuration_path}"
            cp -a "${BACKUP_DIRECTORY}/daf-osm.env" /etc/daf-osm/daf-osm.env
            systemctl restart postgresql.service || true
        fi
        echo "Memory tuning rolled back; saved configuration: ${BACKUP_DIRECTORY}" >&2
    fi
    restore_timers || exit_code=1
    exit "${exit_code}"
}
trap finish EXIT

if [[ "${component}" == graphhopper ]]; then
    install --directory --mode=0755 "$(dirname "${drop_in_path}")"
    if [[ -f "${drop_in_path}" ]]; then
        cp -a "${drop_in_path}" "${BACKUP_DIRECTORY}/memory.conf"
    fi
    systemctl cat graphhopper.service > "${BACKUP_DIRECTORY}/graphhopper.service.before"
    changed=true
    cat > "${drop_in_path}" <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/bin/java -Xms1g -Xmx2g -XX:+UseZGC -Dfile.encoding=UTF-8 -jar /opt/graphhopper/graphhopper-web.jar server /etc/graphhopper/config.yml
UNIT
    systemctl daemon-reload
    systemctl restart graphhopper.service
    healthy=false
    for attempt in {1..30}; do
        if curl --fail --silent --max-time 3 --output /dev/null http://127.0.0.1:8989/info; then
            healthy=true
            break
        fi
        sleep 1
    done
    [[ "${healthy}" == true ]] || { echo 'GraphHopper health check failed' >&2; exit 1; }
    curl --fail --silent --max-time 3 http://127.0.0.1:8990/metrics \
        | python3 -c 'import json,sys; g=json.load(sys.stdin)["gauges"]; assert g["jvm.memory.heap.max"]["value"] == 2147483648; print("Verified GraphHopper 2 GiB heap limit")'
else
    for timer in daf-osm-global-update.timer daf-osm-changeset-update.timer \
        daf-osm-changeset-backfill.timer daf-osm-backup.timer daf-osm-metrics.timer; do
        if systemctl is-active --quiet "${timer}"; then
            timers_to_restart+=("${timer}")
        fi
    done
    if (( ${#timers_to_restart[@]} > 0 )); then
        systemctl stop "${timers_to_restart[@]}"
    fi
    for service in daf-osm-global-update.service daf-osm-changeset-update.service \
        daf-osm-changeset-backfill.service daf-osm-backup.service daf-osm-metrics.service \
        daf-osm-changeset-refresh.service; do
        for attempt in {1..150}; do
            service_is_running "${service}" || break
            sleep 2
        done
        if service_is_running "${service}"; then
            echo "Service did not finish before database tuning: ${service}" >&2
            exit 1
        fi
    done
    exec 10> /run/daf-osm/backup.lock
    flock --timeout 60 10
    exec 9> /run/daf-osm/global.lock
    flock --timeout 60 9
    configuration_path="$(runuser --user postgres -- psql -X -At -c 'SHOW config_file')"
    cp -a "${configuration_path}" "${BACKUP_DIRECTORY}/postgresql.conf"
    cp -a /etc/daf-osm/daf-osm.env "${BACKUP_DIRECTORY}/daf-osm.env"
    changed=true
    cat >> "${configuration_path}" <<'CONFIGURATION'

# DAF shared-host serving memory budget
shared_buffers = '1GB'
effective_cache_size = '3GB'
maintenance_work_mem = '256MB'
autovacuum_work_mem = '128MB'
CONFIGURATION
    sed -i 's/^OSM2PGSQL_CACHE_MB=.*/OSM2PGSQL_CACHE_MB=256/' /etc/daf-osm/daf-osm.env
    grep --quiet '^OSM2PGSQL_CACHE_MB=256$' /etc/daf-osm/daf-osm.env
    systemctl restart postgresql.service
    pg_isready --quiet --timeout=5
    runuser --user postgres -- psql -X -d daf_osm -v ON_ERROR_STOP=1 -At -c "
SELECT 1 / ((current_setting('shared_buffers') = '1GB'
    AND current_setting('effective_cache_size') = '3GB'
    AND current_setting('maintenance_work_mem') = '256MB'
    AND current_setting('autovacuum_work_mem') = '128MB')::integer);
SELECT count(*) FROM osm_current.alpr_nodes;
SELECT count(*) FROM osm_history.alpr_node_versions;
SELECT (SELECT count(*) FROM osm_ingest.alpr_nodes_stage) - (SELECT count(*) FROM osm_current.alpr_nodes);"
fi

echo "TUNING_OK component=${component} configuration_backup=${BACKUP_DIRECTORY}"
