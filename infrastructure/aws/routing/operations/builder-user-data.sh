#!/usr/bin/env bash

set -euo pipefail

cat > /etc/systemd/system/daf-routing-builder-expiry.service <<'UNIT'
[Unit]
Description=Terminate expired DAF GraphHopper builder

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl poweroff
UNIT

cat > /etc/systemd/system/daf-routing-builder-expiry.timer <<'UNIT'
[Unit]
Description=13-hour safety limit for DAF GraphHopper builder

[Timer]
OnBootSec=13h
Unit=daf-routing-builder-expiry.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now daf-routing-builder-expiry.timer
