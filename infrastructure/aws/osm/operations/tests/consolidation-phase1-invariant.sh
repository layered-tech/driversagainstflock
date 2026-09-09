#!/usr/bin/env bash

set -euo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OPERATIONS_DIRECTORY="$(cd "${TEST_DIRECTORY}/.." && pwd)"
readonly OSM_DIRECTORY="$(cd "${OPERATIONS_DIRECTORY}/.." && pwd)"
readonly MIGRATION="${OPERATIONS_DIRECTORY}/migrate-data-volume.sh"
readonly INSTALLER="${OPERATIONS_DIRECTORY}/install-graphhopper.sh"
readonly CLOUDWATCH="${OPERATIONS_DIRECTORY}/cloudwatch-agent.json"
readonly MONITORING="${OSM_DIRECTORY}/monitoring.tf"

for contract in \
    'NEW_DEVICE_SIZE < MINIMUM_REPLACEMENT_SIZE_BYTES' \
    'SOURCE_USED_BYTES + MINIMUM_REFRESH_RESERVE_BYTES > NEW_FILESYSTEM_SIZE_BYTES' \
    'MIGRATION_MODE}" == "rightsize"' \
    'MIGRATION_MODE}" == "rollback"' \
    'daf-osm-changeset-update.timer' \
    'daf-osm-changeset-backfill.timer' \
    'rsync -aHAX --numeric-ids --delete --one-file-system' \
    'rsync -aHAXn --numeric-ids --delete --one-file-system --itemize-changes' \
    'trap rollback EXIT' \
    'cp -a "${FSTAB_BACKUP}" /etc/fstab' \
    'findmnt -nro UUID "${DATA_MOUNT}"' \
    'pg_isready --quiet --timeout=5' \
    'runuser --user osm_ingest -- /opt/daf-osm/bin/validate-core.sh'; do
    grep -qF "${contract}" "${MIGRATION}"
done

python3 - "${MIGRATION}" "${OSM_DIRECTORY}" "${INSTALLER}" "${CLOUDWATCH}" "${MONITORING}" <<'PYTHON'
from __future__ import annotations

import json
import sys
from pathlib import Path

migration = Path(sys.argv[1]).read_text()
root = Path(sys.argv[2])
installer = Path(sys.argv[3]).read_text()
cloudwatch = json.loads(Path(sys.argv[4]).read_text())
monitoring = Path(sys.argv[5]).read_text()
execution = migration[migration.index("trap rollback EXIT"):]

ordered_migration_contracts = (
    'systemctl stop "${RUNTIME_TIMERS[@]}"',
    'systemctl stop "${RUNTIME_SERVICES[@]}"',
    "exec 9> /run/daf-osm/backup.lock",
    "exec 8> /run/daf-osm/global.lock",
    "exec 7> /run/daf-osm/global-current.lock",
    "exec 6> /run/daf-osm/global-history.lock",
    "exec 5> /run/daf-osm/global-changeset.lock",
    "exec 4> /run/daf-osm/global-changeset-backfill.lock",
    "systemctl stop postgresql.service",
    'rsync -aHAX --numeric-ids --delete --one-file-system',
    'cp -a /etc/fstab "${FSTAB_BACKUP}"',
    'mv --force "${FSTAB_PENDING}" /etc/fstab',
    'mount "${DATA_MOUNT}"',
    "systemctl start postgresql.service",
    "pg_isready --quiet --timeout=5",
    "runuser --user osm_ingest -- /opt/daf-osm/bin/validate-core.sh",
    'systemctl start "${timers_to_restart[@]}"',
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
start = storage.index('resource "aws_ebs_volume" "data_canonical"')
end = storage.find('\nresource "', start + 1)
block = storage[start:] if end < 0 else storage[start:end]
if "prevent_destroy = true" not in block:
    raise SystemExit("canonical OSM data volume is not protected from destruction")
if (root / "moved.tf").exists():
    raise SystemExit("temporary OSM rightsizing moved blocks remain configured")
if 'resource "aws_volume_attachment" "data"' not in compute:
    raise SystemExit("canonical OSM data attachment is missing")
if "data_legacy" in storage or "data_legacy" in compute:
    raise SystemExit("legacy OSM data resources remain configured after rollback was waived")
if "count = var.attach_graph_volume_to_shared_host ? 1 : 0" not in compute:
    raise SystemExit("shared graph attachment must remain conditionally managed")
variables = (root / "variables.tf").read_text()
if 'default     = 64' not in variables:
    raise SystemExit("OSM rightsized capacity is not canonical")
if 'default     = "/dev/sdj"' not in variables:
    raise SystemExit("rightsized OSM data device is not canonical")
if 'variable "attach_data_legacy_volume"' in variables or 'variable "data_migration_device"' in variables:
    raise SystemExit("temporary OSM rightsizing variables remain configured")
shared_attachment = variables[variables.index('variable "attach_graph_volume_to_shared_host"'):]
shared_attachment = shared_attachment[:shared_attachment.index("\n}")]
if "default     = true" not in shared_attachment:
    raise SystemExit("shared graph attachment must be enabled after cutover")
if 'threshold           = 70' not in monitoring:
    raise SystemExit("Rightsized data volume must alarm at 70 percent usage")
outputs = (root / "outputs.tf").read_text()
if outputs.count("value       = aws_ebs_volume.data_canonical.id") != 1:
    raise SystemExit("Active data volume output is not canonical")
if 'output "legacy_data_volume_id"' in outputs or 'output "rightsized_data_volume_id"' in outputs:
    raise SystemExit("temporary OSM rightsizing outputs remain configured")
dashboard = (root / "unified-dashboard.tf").read_text()
if dashboard.count("aws_ebs_volume.data_canonical.id") != 3:
    raise SystemExit("EBS dashboard does not monitor the canonical rightsized volume")
if '"${OPERATIONS_SOURCE}/migrate-data-volume.sh" /opt/daf-osm/bin/' not in (root / "operations/install-core.sh").read_text():
    raise SystemExit("Rightsizing migration script is not installed outside the data volume")

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
