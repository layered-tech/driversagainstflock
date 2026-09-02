#!/usr/bin/env bash

set -euo pipefail

readonly OPERATION_VERSION="1.0.0"
readonly GRAPHHOPPER_VERSION="11.0"
readonly GRAPHHOPPER_SHA256="b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def"
readonly GRAPHHOPPER_URL="https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"
readonly OPERATIONS_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DATA_MOUNT="/var/lib/daf-osm"
readonly GRAPH_MOUNT="/var/lib/graphhopper"
readonly AGENT_CONFIG="/etc/daf-osm/cloudwatch-agent.json"
readonly LOG_DIRECTORY="/var/log/daf-routing"
readonly LOG_FILE="${LOG_DIRECTORY}/serving-events.log"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR install-graphhopper must run as root" >&2
    exit 1
fi

if [[ "$(uname -m)" != "aarch64" ]]; then
    echo "ERROR GraphHopper serving requires the planned ARM64 host" >&2
    exit 1
fi

if ss -ltnH 'sport = :8080' | grep -q .; then
    echo "ERROR port 8080 is already in use" >&2
    exit 1
fi

dnf install -y amazon-cloudwatch-agent java-17-amazon-corretto-headless jq nginx >/dev/null

if ! id graphhopper >/dev/null 2>&1; then
    useradd --system --home-dir "${GRAPH_MOUNT}" --no-create-home --shell /sbin/nologin graphhopper
fi

install -d -o root -g root -m 0755 \
    /etc/daf-osm \
    /etc/graphhopper \
    /etc/systemd/system \
    /opt/daf-osm/bin \
    /opt/graphhopper/"${GRAPHHOPPER_VERSION}" \
    "${GRAPH_MOUNT}"
install -d -o root -g graphhopper -m 0750 /var/log/graphhopper
install -d -o root -g root -m 0750 "${LOG_DIRECTORY}" /var/lib/daf-routing-logs
if [[ ! -e "${LOG_FILE}" ]]; then
    install -o root -g root -m 0640 /dev/null "${LOG_FILE}"
else
    chown root:root "${LOG_FILE}"
    chmod 0640 "${LOG_FILE}"
fi

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
  routing.max_visited_nodes: 2147483647
  routing.timeout_ms: 300000
  routing.non_ch.max_waypoint_distance: 6000000
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
UNIT

install -d -m 0755 /etc/systemd/system/nginx.service.d
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
After=network-online.target
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
ReadWritePaths=/var/lib/graphhopper/releases/current/graph-cache/gh.lock /var/log/graphhopper
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT

install -o root -g root -m 0644 \
    "${OPERATIONS_SOURCE}/systemd/daf-routing-serving-state.service" \
    "${OPERATIONS_SOURCE}/systemd/daf-routing-serving-state.timer" \
    "${OPERATIONS_SOURCE}/systemd/daf-routing-serving-metrics.service" \
    "${OPERATIONS_SOURCE}/systemd/daf-routing-serving-metrics.timer" \
    /etc/systemd/system/
install -o root -g root -m 0755 \
    "${OPERATIONS_SOURCE}/bin/publish-routing-serving-state.sh" \
    "${OPERATIONS_SOURCE}/bin/publish-routing-serving-metrics.sh" \
    /opt/daf-osm/bin/

sed "s|__DATA_MOUNT_PATH__|${DATA_MOUNT}|g" \
    "${OPERATIONS_SOURCE}/cloudwatch-agent.json" \
    > "${AGENT_CONFIG}"
chmod 0644 "${AGENT_CONFIG}"

printf '{"timestamp":"%s","event":"shared_host_ready","role":"serving","operation":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${OPERATION_VERSION}" >> "${LOG_FILE}"

systemctl daemon-reload
systemctl disable --now \
    graphhopper.service \
    nginx.service \
    daf-routing-serving-state.timer \
    daf-routing-serving-metrics.timer \
    >/dev/null 2>&1 || true
systemctl start daf-routing-nginx-auth.service
nginx -t

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c "file:${AGENT_CONFIG}"
systemctl is-active --quiet amazon-cloudwatch-agent

echo "INSTALL_SHARED_OK operation=${OPERATION_VERSION} graphhopper=${GRAPHHOPPER_VERSION} traffic=stopped cloudwatch=combined"
