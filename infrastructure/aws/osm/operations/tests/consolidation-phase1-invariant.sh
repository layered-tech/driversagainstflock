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
canonical_start = storage.index('resource "aws_ebs_volume" "data_canonical"')
canonical = storage[canonical_start:]
if "prevent_destroy = true" not in canonical:
    raise SystemExit("canonical OSM data volume is not protected from destruction")
if "data_legacy" in storage:
    raise SystemExit("retired legacy OSM data volume remains configured")
if 'resource "aws_volume_attachment" "data"' not in compute:
    raise SystemExit("canonical OSM data attachment is missing")
if 'resource "aws_volume_attachment" "data_migration"' in compute:
    raise SystemExit("migration-named OSM data attachment remains configured")
if "stop_instance_before_detaching = true" not in compute:
    raise SystemExit("canonical OSM data attachment lacks safe detach behavior")
if "count = var.attach_graph_volume_to_shared_host ? 1 : 0" not in compute:
    raise SystemExit("shared graph attachment must remain conditionally managed")
variables = (root / "variables.tf").read_text()
if "attach_data_legacy_volume" in variables or "data_migration_device" in variables:
    raise SystemExit("OSM root retains migration-only data-volume variables")
if 'default     = "/dev/sdh"' not in variables:
    raise SystemExit("canonical OSM data device is not preserved")
shared_attachment = variables[variables.index('variable "attach_graph_volume_to_shared_host"'):]
shared_attachment = shared_attachment[:shared_attachment.index("\n}")]
if "default     = true" not in shared_attachment:
    raise SystemExit("shared graph attachment must be enabled after cutover")

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
    "SuccessExitStatus=143",
    'mountpoint --quiet "${GRAPH_MOUNT}"',
    'chown -R root:graphhopper "${graph_release_directory}/graph-cache"',
    'chown graphhopper:graphhopper "${graph_release_directory}/graph-cache/gh.lock"',
    "import.osm.ignored_highways: footway,construction,cycleway,path,steps",
):
    if contract not in installer:
        raise SystemExit(f"shared-host installer is missing {contract}")
if "daf-routing-serving-logs.json" in installer:
    raise SystemExit("shared-host installer uses a routing-only agent config")
if installer.index("systemctl start daf-routing-nginx-auth.service") > installer.index("nginx -t"):
    raise SystemExit("nginx validation runs before its authorization include is rendered")
PYTHON

echo "osm-consolidation-phase1-invariants: PASS"
