#!/usr/bin/env bash

set -euo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OPERATIONS_DIRECTORY="$(cd "${TEST_DIRECTORY}/.." && pwd)"
readonly OSM_DIRECTORY="$(cd "${OPERATIONS_DIRECTORY}/.." && pwd)"
readonly MIGRATION="${OPERATIONS_DIRECTORY}/migrate-data-volume.sh"
readonly INSTALLER="${OPERATIONS_DIRECTORY}/install-graphhopper.sh"
readonly CLOUDWATCH="${OPERATIONS_DIRECTORY}/cloudwatch-agent.json"

for contract in \
    'NEW_DEVICE_SIZE < 256 * 1024 * 1024 * 1024' \
    'rsync -aHAX --numeric-ids --delete --one-file-system' \
    'rsync -aHAXn --numeric-ids --delete --one-file-system --itemize-changes' \
    'trap rollback EXIT' \
    'cp -a "${FSTAB_BACKUP}" /etc/fstab' \
    'findmnt -nro UUID "${DATA_MOUNT}"' \
    'pg_isready --quiet --timeout=5'; do
    grep -qF "${contract}" "${MIGRATION}"
done

python3 - "${MIGRATION}" "${OSM_DIRECTORY}" "${INSTALLER}" "${CLOUDWATCH}" <<'PYTHON'
from __future__ import annotations

import json
import sys
from pathlib import Path

migration = Path(sys.argv[1]).read_text()
root = Path(sys.argv[2])
installer = Path(sys.argv[3]).read_text()
cloudwatch = json.loads(Path(sys.argv[4]).read_text())
execution = migration[migration.index("trap rollback EXIT"):]

ordered_migration_contracts = (
    'systemctl stop "${RUNTIME_TIMERS[@]}"',
    'systemctl stop "${RUNTIME_SERVICES[@]}"',
    "systemctl stop postgresql.service",
    'rsync -aHAX --numeric-ids --delete --one-file-system',
    'cp -a /etc/fstab "${FSTAB_BACKUP}"',
    'mount "${DATA_MOUNT}"',
    "restart_runtime",
    "pg_isready --quiet --timeout=5",
)
positions = [execution.find(contract) for contract in ordered_migration_contracts]
if any(position < 0 for position in positions) or positions != sorted(positions):
    raise SystemExit("OSM stop, copy, cutover, and restart ordering is unsafe")

rollback = migration[migration.index("rollback() {"):migration.index("trap rollback EXIT")]
for contract in (
    "systemctl stop postgresql.service",
    'cp -a "${FSTAB_BACKUP}" /etc/fstab',
    "restart_runtime",
):
    if contract not in rollback:
        raise SystemExit(f"rollback is missing {contract}")
if migration.index("migration_complete=true") < migration.index("pg_isready"):
    raise SystemExit("health failure cannot trigger rollback")

storage = (root / "storage.tf").read_text()
compute = (root / "compute.tf").read_text()
moved = (root / "moved.tf").read_text()
for resource in ("data_legacy", "data_canonical"):
    start = storage.index(f'resource "aws_ebs_volume" "{resource}"')
    end = storage.find('\nresource "', start + 1)
    block = storage[start:] if end < 0 else storage[start:end]
    if "prevent_destroy = true" not in block:
        raise SystemExit(f"{resource} is not protected from destruction")
for contract in (
    "from = aws_ebs_volume.data",
    "to   = aws_ebs_volume.data_legacy",
    "from = aws_volume_attachment.data",
    "to   = aws_volume_attachment.data_legacy[0]",
):
    if contract not in moved:
        raise SystemExit("OSM moved blocks are incomplete")
if 'resource "aws_volume_attachment" "data_migration"' not in compute:
    raise SystemExit("canonical OSM migration attachment is missing")
if "count = var.attach_data_legacy_volume ? 1 : 0" not in compute:
    raise SystemExit("legacy OSM data attachment must be independently removable")
if "stop_instance_before_detaching = false" not in compute:
    raise SystemExit("legacy OSM data detachment must not stop the shared host")
if "count = var.attach_graph_volume_to_shared_host ? 1 : 0" not in compute:
    raise SystemExit("shared graph attachment must remain opt-in")

collect_list = cloudwatch["logs"]["logs_collected"]["files"]["collect_list"]
log_pairs = {(entry["file_path"], entry["log_group_name"]) for entry in collect_list}
required_pairs = {
    ("/var/log/daf-osm/global-update.log", "/daf-osm/runtime"),
    ("/var/log/daf-osm/metrics.log", "/daf-osm/runtime"),
    ("/var/log/daf-osm/backup.log", "/daf-osm/runtime"),
    ("/var/log/daf-routing/serving-events.log", "/daf-routing/serving"),
}
if not required_pairs.issubset(log_pairs):
    raise SystemExit("combined CloudWatch logs are incomplete")
if cloudwatch["metrics"]["namespace"] != "DAF/OSM":
    raise SystemExit("combined CloudWatch config overwrites OSM metrics")
for contract in (
    '"${OPERATIONS_SOURCE}/cloudwatch-agent.json"',
    '-c "file:${AGENT_CONFIG}"',
    "traffic=stopped cloudwatch=combined",
    "systemctl disable --now",
):
    if contract not in installer:
        raise SystemExit(f"shared-host installer is missing {contract}")
if "daf-routing-serving-logs.json" in installer:
    raise SystemExit("shared-host installer uses a routing-only agent config")
if installer.index("systemctl start daf-routing-nginx-auth.service") > installer.index("nginx -t"):
    raise SystemExit("nginx validation runs before its authorization include is rendered")
PYTHON

echo "osm-consolidation-phase1-invariants: PASS"
