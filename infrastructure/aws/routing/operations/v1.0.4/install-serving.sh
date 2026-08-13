#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.4"
readonly GRAPHHOPPER_VERSION="11.0"
readonly GRAPHHOPPER_SHA256="b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def"
readonly GRAPHHOPPER_URL="https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"
readonly GRAPH_MOUNT="/var/lib/graphhopper"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR install-serving must run as root" >&2
    exit 1
fi

if [[ "${1:-}" != "--graph-volume-id" || ! "${2:-}" =~ ^vol-[0-9a-f]{17}$ ]]; then
    echo "ERROR usage: install-serving.sh --graph-volume-id vol-XXXXXXXXXXXXXXXXX" >&2
    exit 1
fi

readonly GRAPH_VOLUME_ID="$2"
readonly EXPECTED_VOLUME_SERIAL="${GRAPH_VOLUME_ID//-/}"

if [[ "$(uname -m)" != "aarch64" ]]; then
    echo "ERROR GraphHopper serving requires the planned ARM64 host" >&2
    exit 1
fi

resolve_graph_device() {
    local candidate
    local serial

    for candidate in /dev/nvme*n1; do
        [[ -b "${candidate}" ]] || continue
        serial="$(lsblk -ndo SERIAL "${candidate}" | tr -d '[:space:]-')"

        if [[ "${serial}" == "${EXPECTED_VOLUME_SERIAL}" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    return 1
}

readonly GRAPH_DEVICE="$(resolve_graph_device || true)"

if [[ -z "${GRAPH_DEVICE}" ]]; then
    echo "ERROR expected graph volume is not attached" >&2
    exit 1
fi

readonly ROOT_SOURCE="$(findmnt -nro SOURCE /)"
readonly ROOT_PARENT="/dev/$(lsblk -ndo PKNAME "${ROOT_SOURCE}")"

if [[ "${GRAPH_DEVICE}" == "${ROOT_SOURCE}" || "${GRAPH_DEVICE}" == "${ROOT_PARENT}" ]]; then
    echo "ERROR refusing to format the root device" >&2
    exit 1
fi

readonly GRAPH_DEVICE_SIZE="$(blockdev --getsize64 "${GRAPH_DEVICE}")"

if (( GRAPH_DEVICE_SIZE < 500 * 1024 * 1024 * 1024 )); then
    echo "ERROR graph volume is smaller than the planned 500 GiB minimum" >&2
    exit 1
fi

dnf install -y java-17-amazon-corretto-headless nginx xfsprogs

graph_filesystem="$(lsblk -ndo FSTYPE "${GRAPH_DEVICE}")"

if [[ -z "${graph_filesystem}" ]]; then
    mkfs.xfs -L daf-graphs "${GRAPH_DEVICE}"
elif [[ "${graph_filesystem}" != "xfs" ]]; then
    echo "ERROR graph volume has an unexpected filesystem" >&2
    exit 1
fi

mkdir -p "${GRAPH_MOUNT}"
readonly GRAPH_UUID="$(blkid -s UUID -o value "${GRAPH_DEVICE}")"

if ! grep -qF "UUID=${GRAPH_UUID} ${GRAPH_MOUNT} " /etc/fstab; then
    printf 'UUID=%s %s xfs defaults,nofail,nodev,nosuid 0 2\n' "${GRAPH_UUID}" "${GRAPH_MOUNT}" >> /etc/fstab
fi

if ! mountpoint --quiet "${GRAPH_MOUNT}"; then
    mount "${GRAPH_MOUNT}"
fi

if ! id graphhopper >/dev/null 2>&1; then
    useradd --system --home-dir "${GRAPH_MOUNT}" --shell /sbin/nologin graphhopper
fi

install -d -o root -g graphhopper -m 0750 \
    /etc/graphhopper \
    /opt/graphhopper/"${GRAPHHOPPER_VERSION}" \
    "${GRAPH_MOUNT}/releases" \
    /var/log/graphhopper

readonly JAR_PATH="/opt/graphhopper/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"
readonly JAR_DOWNLOAD="${JAR_PATH}.download"

if [[ ! -f "${JAR_PATH}" ]] || ! printf '%s  %s\n' "${GRAPHHOPPER_SHA256}" "${JAR_PATH}" | sha256sum --check --status; then
    curl --fail --location --silent --show-error --output "${JAR_DOWNLOAD}" "${GRAPHHOPPER_URL}"
    printf '%s  %s\n' "${GRAPHHOPPER_SHA256}" "${JAR_DOWNLOAD}" | sha256sum --check --status
    install -o root -g root -m 0644 "${JAR_DOWNLOAD}" "${JAR_PATH}"
    rm -f "${JAR_DOWNLOAD}"
fi

ln -sfn "${JAR_PATH}" /opt/graphhopper/graphhopper-web.jar

cat > /etc/graphhopper/config.yml <<'YAML'
graphhopper:
  datareader.file: ""
  graph.location: /var/lib/graphhopper/releases/current/graph-cache
  profiles:
    - name: car
      turn_costs:
        vehicle_types: [motorcar, motor_vehicle]
        u_turn_costs: 60
      custom_model_files: [car.json]
  profiles_ch: []
  profiles_lm:
    - profile: car
  graph.encoded_values: car_access, car_average_speed, road_access
  routing.max_visited_nodes: 1000000
  routing.timeout_ms: 300000
  routing.non_ch.max_waypoint_distance: 1000000
  graph.dataaccess.default_type: MMAP_RO

server:
  application_connectors:
    - type: http
      port: 8989
      bind_host: 127.0.0.1
      max_request_header_size: 50k
  request_log:
    appenders: []
  admin_connectors:
    - type: http
      port: 8990
      bind_host: 127.0.0.1

logging:
  level: WARN
  appenders:
    - type: console
      time_zone: UTC
      log_format: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
YAML

chown root:graphhopper /etc/graphhopper/config.yml
chmod 0640 /etc/graphhopper/config.yml

cat > /usr/local/sbin/render-daf-routing-nginx-auth <<'SCRIPT'
#!/usr/bin/env bash

set -euo pipefail

readonly token="$(aws ssm get-parameter --region us-east-1 --name /daf-routing/service-token --with-decryption --query Parameter.Value --output text)"

if [[ ! "${token}" =~ ^[A-Za-z0-9._~-]{32,256}$ ]]; then
    echo "ERROR service token has an unsafe format" >&2
    exit 1
fi

umask 077
cat > /run/daf-routing-nginx-auth.conf <<EOF
map \$http_authorization \$daf_routing_authorized {
    default 0;
    "Bearer ${token}" 1;
}
EOF
SCRIPT
chmod 0755 /usr/local/sbin/render-daf-routing-nginx-auth

cat > /etc/systemd/system/daf-routing-nginx-auth.service <<'UNIT'
[Unit]
Description=Render DAF routing nginx authorization configuration
Before=nginx.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/render-daf-routing-nginx-auth
RemainAfterExit=yes
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT

mkdir -p /etc/systemd/system/nginx.service.d
cat > /etc/systemd/system/nginx.service.d/daf-routing.conf <<'UNIT'
[Unit]
Requires=daf-routing-nginx-auth.service
After=daf-routing-nginx-auth.service
UNIT

cat > /etc/nginx/nginx.conf <<'NGINX'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log crit;
pid /run/nginx.pid;

include /usr/share/nginx/modules/*.conf;

events {
    worker_connections 1024;
}

http {
    map_hash_bucket_size 128;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log off;
    server_tokens off;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    types_hash_max_size 4096;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
}
NGINX

cat > /etc/nginx/conf.d/daf-routing.conf <<'NGINX'
include /run/daf-routing-nginx-auth.conf;

server {
    listen 8080 default_server;
    server_name _;
    client_max_body_size 0;

    access_log off;
    error_log /var/log/nginx/daf-routing-error.log crit;

    location = /health/live {
        add_header Cache-Control "no-store" always;
        return 204;
    }

    location / {
        if ($daf_routing_authorized = 0) {
            return 401;
        }

        proxy_pass http://127.0.0.1:8989;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Request-ID $request_id;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Real-IP "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 65s;
    }
}
NGINX

cat > /etc/systemd/system/graphhopper.service <<'UNIT'
[Unit]
Description=GraphHopper 11 private routing service
After=network-online.target var-lib-graphhopper.mount
Wants=network-online.target
RequiresMountsFor=/var/lib/graphhopper
ConditionPathExists=/var/lib/graphhopper/releases/current/graph-cache/properties

[Service]
Type=simple
User=graphhopper
Group=graphhopper
WorkingDirectory=/var/lib/graphhopper
ExecStart=/usr/bin/java -Xms4g -Xmx8g -XX:+UseZGC -Dfile.encoding=UTF-8 -jar /opt/graphhopper/graphhopper-web.jar server /etc/graphhopper/config.yml
Restart=on-failure
RestartSec=10s
TimeoutStopSec=60s
NoNewPrivileges=yes
PrivateTmp=yes
ProtectControlGroups=yes
ProtectHome=yes
ProtectKernelModules=yes
ProtectKernelTunables=yes
ProtectSystem=strict
ReadOnlyPaths=/var/lib/graphhopper/releases
ReadWritePaths=/var/log/graphhopper
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable daf-routing-nginx-auth.service nginx.service graphhopper.service
systemctl restart daf-routing-nginx-auth.service
nginx -t
systemctl restart nginx.service

if [[ -f "${GRAPH_MOUNT}/releases/current/graph-cache/properties" ]]; then
    systemctl restart graphhopper.service
    graph_state="active"
else
    systemctl stop graphhopper.service >/dev/null 2>&1 || true
    graph_state="pending-artifact"
fi

echo "INSTALL_OK version=${OPERATION_VERSION} graphhopper=${GRAPHHOPPER_VERSION} graph=${graph_state}"
