#!/usr/bin/env bash
set -Eeuo pipefail

readonly OPERATIONS_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_DIRECTORY="$(cd "${OPERATIONS_DIRECTORY}/../../../.." && pwd)"
readonly OUTPUT_DIRECTORY="${REPOSITORY_DIRECTORY}/infrastructure/aws/osm/.terraform"
readonly OUTPUT_PATH="${OUTPUT_DIRECTORY}/osm-stack-v1.tar.gz"
readonly DIGEST_PATH="${OUTPUT_PATH}.sha256"

mkdir -p "${OUTPUT_DIRECTORY}"
chmod 0750 "${OUTPUT_DIRECTORY}"

python3 - "${REPOSITORY_DIRECTORY}" "${OUTPUT_PATH}" "${DIGEST_PATH}" <<'PYTHON'
from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
from pathlib import Path


repository = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
digest_path = Path(sys.argv[3]).resolve()
operations = repository / "infrastructure/aws/osm/operations"
database = repository / "database/osm2pgsql/production"

sources: list[tuple[Path, Path]] = [
    (operations / "install.sh", Path("operations/install.sh")),
    (operations / "install-core.sh", Path("operations/install-core.sh")),
    (operations / "install-graphhopper.sh", Path("operations/install-graphhopper.sh")),
    (operations / "migrate-data-volume.sh", Path("operations/migrate-data-volume.sh")),
    (operations / "daf-osm.env", Path("operations/daf-osm.env")),
    (operations / "cloudwatch-agent.json", Path("operations/cloudwatch-agent.json")),
]

for source_root, archive_root, suffixes in (
    (operations / "bin", Path("operations/bin"), {".py", ".sh"}),
    (operations / "systemd", Path("operations/systemd"), {".service", ".timer"}),
    (database, Path("database/osm2pgsql/production"), {".lua", ".sql"}),
):
    for source in sorted(source_root.iterdir()):
        if source.is_file() and source.suffix in suffixes:
            sources.append((source, archive_root / source.name))

missing = [str(source) for source, _ in sources if not source.is_file()]
if missing:
    raise SystemExit("Missing artifact inputs: " + ", ".join(missing))

required_paths = {
    "operations/install.sh",
    "operations/install-core.sh",
    "operations/install-graphhopper.sh",
    "operations/migrate-data-volume.sh",
    "operations/daf-osm.env",
    "operations/cloudwatch-agent.json",
    "operations/bin/backup.sh",
    "operations/bin/backup-core.sh",
    "operations/bin/activate-global-feed.sh",
    "operations/bin/bootstrap-current.sh",
    "operations/bin/bootstrap-current-core.sh",
    "operations/bin/bootstrap-history.sh",
    "operations/bin/bootstrap-history-wrapper.sh",
    "operations/bin/bootstrap-history-core.sh",
    "operations/bin/cleanup-history-bootstrap.sh",
    "operations/bin/common.sh",
    "operations/bin/common-core.sh",
    "operations/bin/current-update.sh",
    "operations/bin/fetch-node-changes.py",
    "operations/bin/filter-current-change.py",
    "operations/bin/global-update.sh",
    "operations/bin/history-bootstrap-condition.sh",
    "operations/bin/history-update.sh",
    "operations/bin/import-history.py",
    "operations/bin/initialize-global-stack.sh",
    "operations/bin/metrics.sh",
    "operations/bin/prepare-global-rebuild.sh",
    "operations/bin/restore-phase7-runtime-state.sh",
    "operations/bin/validate.sh",
    "operations/bin/validate-core.sh",
    "operations/systemd/daf-osm-backup.service",
    "operations/systemd/daf-osm-backup.timer",
    "operations/systemd/daf-osm-current-bootstrap.service",
    "operations/systemd/daf-osm-global-activate.service",
    "operations/systemd/daf-osm-global-initialize.service",
    "operations/systemd/daf-osm-global-rebuild-prepare.service",
    "operations/systemd/daf-osm-global-update.service",
    "operations/systemd/daf-osm-global-update.timer",
    "operations/systemd/daf-osm-history-bootstrap.service",
    "operations/systemd/daf-osm-metrics.service",
    "operations/systemd/daf-osm-metrics.timer",
    "database/osm2pgsql/production/alpr-current.lua",
    "database/osm2pgsql/production/discover-history-candidates.sql",
    "database/osm2pgsql/production/history-bootstrap-load.sql",
    "database/osm2pgsql/production/history-load.sql",
    "database/osm2pgsql/production/publish-current.sql",
    "database/osm2pgsql/production/schema-base.sql",
    "database/osm2pgsql/production/schema.sql",
}

source_by_destination = {
    destination.as_posix(): source
    for source, destination in sources
}
missing_required = sorted(required_paths - source_by_destination.keys())
if missing_required:
    raise SystemExit("Missing required runtime files: " + ", ".join(missing_required))
if len(source_by_destination) != len(sources):
    raise SystemExit("Artifact contains duplicate destination paths")

for destination in source_by_destination:
    if re.search(r"-(?:v[0-9]+|final)(?:\.|$)", destination):
        raise SystemExit(f"Versioned implementation leaked into artifact: {destination}")

for service_source, service_destination in sources:
    if service_destination.suffix != ".service":
        continue
    service = service_source.read_text(encoding="utf-8")
    if "/run/daf-osm/" in service and "RuntimeDirectory=daf-osm" not in service:
        raise SystemExit(
            f"{service_source.name} uses a runtime lock without creating its directory"
        )
    for executable in re.findall(r"/opt/daf-osm/bin/([A-Za-z0-9._-]+)", service):
        runtime_path = f"operations/bin/{executable}"
        if runtime_path not in source_by_destination:
            raise SystemExit(
                f"{service_source.name} references missing executable {runtime_path}"
            )

for shell_source, destination in sources:
    if destination.suffix == ".sh":
        subprocess.run(["bash", "-n", str(shell_source)], check=True)
for python_source, destination in sources:
    if destination.suffix == ".py":
        compile(python_source.read_text(encoding="utf-8"), str(python_source), "exec")

environment = (operations / "daf-osm.env").read_text(encoding="utf-8")
for endpoint in (
    "https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf",
    "https://osm-planet-us-west-2.s3.dualstack.us-west-2.amazonaws.com/planet-full-history/pbf",
    "https://planet.openstreetmap.org/replication/minute/",
):
    if endpoint not in environment:
        raise SystemExit(f"Missing required OSM endpoint: {endpoint}")
for retired_contract in (
    "download.openstreetmap.fr",
    "NORTH_AMERICA",
    "OSM_REGION_POLYGON",
):
    if retired_contract in environment:
        raise SystemExit(f"Retired regional environment contract remains: {retired_contract}")

cloudwatch = json.loads(
    (operations / "cloudwatch-agent.json").read_text(encoding="utf-8")
)
if cloudwatch["metrics"].get("namespace") != "DAF/OSM":
    raise SystemExit("CloudWatch namespace must be DAF/OSM")
if "retention_in_days" in json.dumps(cloudwatch):
    raise SystemExit("Terraform must remain authoritative for log retention")
log_paths = {
    entry["file_path"]
    for entry in cloudwatch["logs"]["logs_collected"]["files"]["collect_list"]
}
required_log_paths = {
    "/var/log/daf-osm/global-update.log",
    "/var/log/daf-osm/metrics.log",
    "/var/log/daf-osm/backup.log",
}
if not required_log_paths.issubset(log_paths):
    raise SystemExit("CloudWatch must collect active global runtime logs")
if log_paths & {"/var/log/daf-osm/current-*.log", "/var/log/daf-osm/history-*.log"}:
    raise SystemExit("CloudWatch still collects retired replication logs")

install = (operations / "install.sh").read_text(encoding="utf-8")
for contract in (
    "database.daf-osm.internal",
    "subjectAltName=DNS:",
    "daf-osm-backup.timer",
    "backup timer remains disabled",
):
    if contract not in install:
        raise SystemExit(f"Missing final install contract: {contract}")

install_core = (operations / "install-core.sh").read_text(encoding="utf-8")
for contract in (
    "RequiresMountsFor=%s",
    "a32140835bf919cd3f0a15478db320b05b59a5ab",
    "e2afb9420e489fa5c300b7e4b25b03f235602b93",
    "97dccf105391d410701ae8bd52170dc0ee041373",
    "daf-osm-install.lock",
    "/run/daf-osm/backup.lock",
    "/run/daf-osm/global-current.lock",
    "/run/daf-osm/global-history.lock",
    "patch_boost_discovery",
    "find_package(Boost CONFIG 1.50 REQUIRED)",
    "find_package(Boost 1.50 REQUIRED)",
    "find_package(Boost CONFIG 1.55.0 REQUIRED COMPONENTS program_options)",
    "find_package(Boost 1.55.0 REQUIRED COMPONENTS program_options)",
    "osm2pgsql --version 2>&1",
    "osmium --version 2>&1",
    "installed_osm_tools_are_current",
    'chmod 0711 "${DATA_MOUNT_PATH}"',
    "--group=osm_ingest --mode=0750 /etc/daf-osm",
    "systemctl restart",
):
    if contract not in install_core:
        raise SystemExit(f"Missing AL2023 install contract: {contract}")

installer_lock_positions = [
    install_core.find("/run/daf-osm/backup.lock"),
    install_core.find("/run/daf-osm/current.lock"),
    install_core.find("/run/daf-osm/history.lock"),
    install_core.find("/run/daf-osm/global.lock"),
    install_core.find("/run/daf-osm/global-current.lock"),
    install_core.find("/run/daf-osm/global-history.lock"),
]
if any(position < 0 for position in installer_lock_positions) or installer_lock_positions != sorted(installer_lock_positions):
    raise SystemExit("Installer lock order must be backup, legacy consumers, then global consumers")

user_data = (operations / "user-data.sh").read_text(encoding="utf-8")
if "awscli2" in install_core or "awscli2" in user_data:
    raise SystemExit("AL2023 bootstrap must use the awscli package name")
if not re.search(r"(?m)^\s*awscli\s*$", install_core):
    raise SystemExit("Packaged installer must install the AL2023 awscli package")
if "curl-minimal" not in install_core or re.search(r"(?m)^\s*curl\s*$", install_core):
    raise SystemExit("Packaged installer must preserve AL2023 curl-minimal")
for contract in (
    "runtime_packages=(",
    "dnf install --assumeno",
    "Dependencies resolved.",
    "Operation aborted.",
    "Problem:",
):
    if contract not in install_core:
        raise SystemExit(f"Missing package transaction preflight contract: {contract}")
if "dnf install --assumeyes awscli coreutils" not in user_data:
    raise SystemExit("User data must install the AL2023 awscli package")
if not re.search(r"(?m)^    env \\$", user_data):
    raise SystemExit("User data must pass install variables through env")
if 'if ! mountpoint --quiet "$${DATA_MOUNT_PATH}"; then' not in user_data:
    raise SystemExit("User data must tolerate an already-mounted data volume")

if "systemctl start --no-block daf-osm-" in user_data:
    raise SystemExit("User data must not start either data bootstrap")
if "sha256sum --check" not in user_data:
    raise SystemExit("User data must verify the plan-pinned artifact SHA-256")

current_bootstrap = (
    operations / "bin/bootstrap-current-core.sh"
).read_text(encoding="utf-8")
for contract in (
    "${resolved_planet_url}.md5",
    'n/surveillance:type=ALPR',
    'fetch-node-changes.py initialize',
    'global-current-replication.state',
):
    if contract not in current_bootstrap:
        raise SystemExit(f"Missing global current bootstrap contract: {contract}")

history_unit = (
    operations / "systemd/daf-osm-history-bootstrap.service"
).read_text(encoding="utf-8")
if "Requires=daf-osm-current-bootstrap.service" in history_unit:
    raise SystemExit("History bootstrap must not start current bootstrap")
if "ExecCondition=/opt/daf-osm/bin/history-bootstrap-condition.sh" not in history_unit:
    raise SystemExit("History bootstrap must require the durable current marker")

history_bootstrap = (
    operations / "bin/bootstrap-history-core.sh"
).read_text(encoding="utf-8")
for contract in (
    "current_planet_resolved_url",
    "history-${planet_release}.osm.pbf",
    "Current and full-history planet releases differ",
):
    if contract not in history_bootstrap:
        raise SystemExit(f"Missing release-aligned history bootstrap contract: {contract}")
ordered_contracts = (
    "'n/surveillance:type=ALPR'",
    "discover-history-candidates.sql",
    "osmium getid",
    '--input "${all_candidate_versions}"',
)
positions = [history_bootstrap.find(contract) for contract in ordered_contracts]
if any(position < 0 for position in positions) or positions != sorted(positions):
    raise SystemExit(
        "History bootstrap must qualify global exact-tag versions before all-version retention"
    )
if r"https://osm-planet-us-west-2\.s3\.dualstack\.us-west-2\.amazonaws\.com/planet-full-history/pbf/" not in history_bootstrap:
    raise SystemExit("History bootstrap must allow the official OSM US West S3 distribution path")
if "TRUNCATE osm_pipeline.global_alpr_node_ids" not in (
    operations / "bin/bootstrap-history.sh"
).read_text(encoding="utf-8"):
    raise SystemExit("History bootstrap candidates must start from an isolated set")

history_importer = (operations / "bin/import-history.py").read_text(encoding="utf-8")
if '["osmium", "cat", "--output-format=opl", arguments.input]' not in history_importer:
    raise SystemExit("History importer must select OPL before its positional input")
if 'return unquote(value, encoding="utf-8", errors="replace").replace("\\x00", "\\ufffd")' not in history_importer:
    raise SystemExit("History importer must safely replace invalid legacy UTF-8 and NUL bytes")
if 'csv.writer(psql_stdin, delimiter="\\t", lineterminator="\\r\\n")' not in history_importer:
    raise SystemExit("History importer must quote embedded carriage returns and newlines")
history_update = (operations / "bin/history-update.sh").read_text(encoding="utf-8")
if "api_history" not in history_update or "--polygon" in history_update:
    raise SystemExit("Global API backfill must import full history without regional qualification")
current_update = (operations / "bin/current-update.sh").read_text(encoding="utf-8")
replication_helper = (
    operations / "bin/fetch-node-changes.py"
).read_text(encoding="utf-8")
if "--output-schema" in current_bootstrap or "--output-schema" in current_update:
    raise SystemExit("osm2pgsql 2.3.1 does not support --output-schema")
for current_command in (current_bootstrap, current_update):
    if "--schema=osm_ingest" not in current_command:
        raise SystemExit(
            "osm2pgsql current commands must align the default and middle schemas"
        )
    if "--middle-schema=osm_ingest" not in current_command:
        raise SystemExit("osm2pgsql current middle tables must use osm_ingest")
if "fetch-node-changes.py update" in current_update:
    raise SystemExit("Current consumer must not download a second replication stream")
if re.search(r"--command=.*:'", current_update):
    raise SystemExit("Current cursor SQL variables must be supplied through standard input")
if "--simplify" in history_update:
    raise SystemExit("History replication must retain intermediate node versions")
if re.search(r"--command=.*:'", history_update):
    raise SystemExit("History SQL variables must be supplied through standard input")
if "fetch-node-changes.py update" in history_update:
    raise SystemExit("History consumer must not download a second replication stream")
if "CurrentConsumerFailures" in current_update or "HistoryConsumerFailures" in history_update:
    raise SystemExit("Consumers must not duplicate orchestrator failure metrics")
global_update = (operations / "bin/global-update.sh").read_text(encoding="utf-8")
for contract in (
    'readonly GLOBAL_STATE="${OSM_STATE_PATH}/global-replication.state"',
    'readonly GLOBAL_SPOOL_PATH="${OSM_DATA_PATH}/global-replication-spool"',
    '--server "${OSM_GLOBAL_REPLICATION_URL}"',
    '/opt/daf-osm/bin/current-update.sh',
    '/opt/daf-osm/bin/history-update.sh',
    'current_sequence >= replication_sequence && history_sequence >= replication_sequence',
):
    if contract not in global_update:
        raise SystemExit(f"Missing shared global replication contract: {contract}")
if global_update.count("fetch-node-changes.py update") != 1:
    raise SystemExit("Shared global replication must fetch each batch exactly once")
if "--simplify" in global_update:
    raise SystemExit("Shared global replication must retain versions for history")
if 'global-stack.complete' not in global_update:
    raise SystemExit("Shared global replication must remain gated until global bootstrap")
if "trap - ERR" not in global_update:
    raise SystemExit("Consumer failures must not increment shared-feed failure metrics")
initializer = (operations / "bin/initialize-global-stack.sh").read_text(encoding="utf-8")
for contract in (
    "global-current-bootstrap.complete",
    "global-history-bootstrap.complete",
    "shared_feed_sequence",
    "shared_feed_source_timestamp",
    "Global current and history bootstraps do not share one release cursor",
    "Global current and history bootstraps do not share one release timestamp",
):
    if contract not in initializer:
        raise SystemExit(f"Missing global initialization contract: {contract}")
activator = (operations / "bin/activate-global-feed.sh").read_text(encoding="utf-8")
for contract in (
    "global-stack.complete",
    "daf-osm-global-update.timer",
    "daf-osm-metrics.timer",
):
    if contract not in activator:
        raise SystemExit(f"Missing global activation contract: {contract}")
rebuild = (operations / "bin/prepare-global-rebuild.sh").read_text(encoding="utf-8")
for contract in (
    "phase7-backup.complete",
    "phase7-current-bootstrap.complete",
    "phase7-history-bootstrap.complete",
    "phase7-validation.complete",
    "phase7-history-bootstrap-source-removed.complete",
    "history-bootstrap-source-removed.complete",
    "daf-osm-metrics.timer",
    "daf-osm-backup.timer",
    "/run/daf-osm/backup.lock",
    "/run/daf-osm/global.lock",
    "/run/daf-osm/global-current.lock",
    "/run/daf-osm/global-history.lock",
    "restore_runtime_lock_ownership",
    "trap restore_runtime_lock_ownership EXIT",
    "DROP SCHEMA IF EXISTS osm_current CASCADE",
):
    if contract not in rebuild:
        raise SystemExit(f"Missing in-place global rebuild contract: {contract}")
phase_seven_restore = (
    operations / "bin/restore-phase7-runtime-state.sh"
).read_text(encoding="utf-8")
for contract in (
    "current_applied_sequence",
    "current_source_timestamp",
    "history_applied_sequence",
    "history_source_timestamp",
    "phase7-backup.complete",
    "daf-osm-global-update.timer",
    "daf-osm-backup.timer",
    "/run/daf-osm/backup.lock",
):
    if contract not in phase_seven_restore:
        raise SystemExit(f"Missing Phase 7 rollback reconstruction contract: {contract}")
install_enabled_units = install_core[install_core.find("enable_operations()") :]
if "systemctl disable --now daf-osm-global-update.timer" not in install_enabled_units:
    raise SystemExit("Global replication timer must await separately approved activation")
if "publish-current.sql" in history_bootstrap or "publish-current.sql" in history_update:
    raise SystemExit("Only the current pipeline may publish current rows and cursors")
if "fetch-node-changes.py initialize" not in history_bootstrap:
    raise SystemExit("History bootstrap must initialize a full overlap cursor")
if "simplify=arguments.simplify" not in replication_helper:
    raise SystemExit("Replication simplification must be selected per stream")
legacy_cursor_contract = "\n".join(
    (current_update, history_update, history_bootstrap, install_core)
)
if (
    "PYOSMIUM_GET_CHANGES" in legacy_cursor_contract
    or "pyosmium-get-changes" in legacy_cursor_contract
):
    raise SystemExit("Runtime must not use pyosmium's incompatible numeric sequence file")

common = (operations / "bin/common.sh").read_text(encoding="utf-8")
common_core = (operations / "bin/common-core.sh").read_text(encoding="utf-8")
if "BEGIN;\nINSERT INTO osm_pipeline.state" not in common:
    raise SystemExit("History sequence and timestamp must commit atomically")
for state_helper in (common, common_core):
    if re.search(r"--command=.*:'", state_helper):
        raise SystemExit("psql variable SQL must be supplied through standard input")
    if "<<'PIPELINE_STATE_SQL'" not in state_helper:
        raise SystemExit("Pipeline state writes must use a quoted SQL heredoc")

current_filter = (
    operations / "bin/filter-current-change.py"
).read_text(encoding="utf-8")
if "self.tracked_ids.add(node.id)" not in current_filter:
    raise SystemExit("Current filter must retain later versions after an ALPR match")
for contract in (
    "osmium.MergeInputReader()",
    "reader.apply(handler, simplify=True)",
):
    if contract not in current_filter:
        raise SystemExit(
            "Current consumer must collapse shared history batches to terminal node versions"
        )

cleanup = (
    operations / "bin/cleanup-history-bootstrap.sh"
).read_text(encoding="utf-8")
cleanup_lock_positions = [
    cleanup.find("/run/daf-osm/global.lock"),
    cleanup.find("/run/daf-osm/global-current.lock"),
    cleanup.find("/run/daf-osm/global-history.lock"),
    cleanup.find('if [[ -f "${CLEANUP_MARKER}" ]]'),
]
if any(position < 0 for position in cleanup_lock_positions) or cleanup_lock_positions != sorted(cleanup_lock_positions):
    raise SystemExit("History source cleanup must freeze shared/current/history before its gates")
for contract in (
    "global-history-bootstrap-source-removal.pending",
    "global-validation.complete",
    "backup.complete",
):
    if contract not in cleanup:
        raise SystemExit(f"Missing durable history cleanup contract: {contract}")

backup = (operations / "bin/backup-core.sh").read_text(encoding="utf-8")
backup_wrapper = (operations / "bin/backup.sh").read_text(encoding="utf-8")
backup_unit = (
    operations / "systemd/daf-osm-backup.service"
).read_text(encoding="utf-8")

backup_lock_positions = [
    backup_wrapper.find("/run/daf-osm/backup.lock"),
    backup_wrapper.find("/run/daf-osm/global.lock"),
    backup_wrapper.find("/run/daf-osm/global-current.lock"),
    backup_wrapper.find("/run/daf-osm/global-history.lock"),
    backup_wrapper.find("source /opt/daf-osm/bin/backup-core.sh"),
]
if any(position < 0 for position in backup_lock_positions) or backup_lock_positions != sorted(backup_lock_positions):
    raise SystemExit("Backup must freeze backup/shared/current/history before snapshot capture")
if "flock" in backup_unit:
    raise SystemExit("Backup service must delegate the complete lock order to backup.sh")

if "--compress=gzip:6" not in backup:
    raise SystemExit("Backup compression must match the deployed pg_dump build")

if backup.count("psql_osm") != 1:
    raise SystemExit("Backup must capture its database observation in one query")
if "psql_osm" in backup_wrapper:
    raise SystemExit("Backup wrapper must not re-query after dump/upload")

for state_key in (
    "shared_feed_sequence",
    "current_applied_sequence",
    "history_applied_sequence",
):
    if backup.count(f"state_key = '{state_key}'") != 1:
        raise SystemExit(f"Backup must capture {state_key} exactly once")

positions = [
    backup.find("psql_osm"),
    backup.find("pg_dump"),
    backup.find("jq --null-input"),
    backup.find("aws s3 cp"),
]
if any(position < 0 for position in positions) or positions != sorted(positions):
    raise SystemExit("Backup cursor capture must precede dump, manifest, and upload")

for contract in (
    "--metadata",
    "head-object",
    "remote_archive_size",
    "cleanup_local_backup",
    '--argjson current_sequence "${backup_current_sequence}"',
    '--argjson history_sequence "${backup_history_sequence}"',
    '--argjson shared_sequence "${backup_shared_sequence}"',
    "global-validation.complete",
    "Pre-dump global cursors have not converged",
    "pre_dump_current_alpr_node_count:",
    "pre_dump_history_event_count:",
):
    if contract not in backup:
        raise SystemExit(f"Missing truthful backup contract: {contract}")

for contract in (
    'last_successful_backup_shared_sequence "${backup_shared_sequence}"',
    'last_successful_backup_current_sequence "${backup_current_sequence}"',
    'last_successful_backup_history_sequence "${backup_history_sequence}"',
    '"${backup_completed_at}"',
):
    if contract not in backup_wrapper:
        raise SystemExit(f"Backup marker does not reuse sourced snapshot: {contract}")

schema = (database / "schema-base.sql").read_text(encoding="utf-8")
if "qualified_at timestamptz NOT NULL" not in schema:
    raise SystemExit("Global history qualification timestamp is missing")
for retired_column in (
    "region_confirmed_at",
    "last_region_check_version",
    "last_region_checked_at",
):
    if retired_column in schema:
        raise SystemExit(f"Retired regional schema column remains: {retired_column}")

if re.search(
    r"(?m)^\s*(current_alpr_node_count|history_event_count):",
    backup,
):
    raise SystemExit("Backup manifest contains misleading unqualified counts")

flex = (database / "alpr-current.lua").read_text(encoding="utf-8")
for contract in (
    "os.date('!%Y-%m-%dT%H:%M:%SZ', timestamp)",
    "{ column = 'osm_version', type = 'int4', not_null = true }",
    "{ column = 'osm_user', type = 'text', not_null = true }",
):
    if contract not in flex:
        raise SystemExit(f"Missing current contributor contract: {contract}")
if "define_way_table" in flex or "define_relation_table" in flex:
    raise SystemExit("Flex configuration must remain node-only")

schema = (database / "schema-base.sql").read_text(encoding="utf-8")
for contract in (
    "SET ROLE osm_owner;",
    "REVOKE CONNECT, CREATE, TEMPORARY",
    'GRANT CONNECT, TEMPORARY ON DATABASE :"database_name" TO osm_ingest;',
    'GRANT CONNECT ON DATABASE :"database_name" TO osm_publisher;',
    "GRANT SELECT ON ALL TABLES IN SCHEMA osm_current, osm_history TO osm_publisher;",
    "CREATE OR REPLACE VIEW osm_current.application_alpr_nodes AS",
    "GRANT SELECT ON osm_current.application_alpr_nodes TO osm_publisher;",
):
    if contract not in schema:
        raise SystemExit(f"Missing database ownership/reader contract: {contract}")
validation = (
    operations / "bin/validate-core.sh"
).read_text(encoding="utf-8")
validation_wrapper = (
    operations / "bin/validate.sh"
).read_text(encoding="utf-8")
validation_lock_positions = [
    validation_wrapper.find("/run/daf-osm/global.lock"),
    validation_wrapper.find("/run/daf-osm/global-current.lock"),
    validation_wrapper.find("/run/daf-osm/global-history.lock"),
    validation_wrapper.find("/opt/daf-osm/bin/validate-core.sh"),
]
if any(position < 0 for position in validation_lock_positions) or validation_lock_positions != sorted(validation_lock_positions):
    raise SystemExit("Validation must freeze shared/current/history before checking and marking")
for contract in (
    "has_database_privilege('osm_ingest', current_database(), 'TEMPORARY')",
    "has_database_privilege('osm_publisher', current_database(), 'TEMPORARY')",
):
    if contract not in validation:
        raise SystemExit(f"Missing runtime database privilege validation: {contract}")

for loader_name in ("history-load.sql", "history-bootstrap-load.sql"):
    loader = (database / loader_name).read_text(encoding="utf-8")
    if "TRUNCATE osm_pipeline.node_versions_stage;" not in loader:
        raise SystemExit(f"{loader_name} must clean staging after durable load")

temporary = output.with_suffix(output.suffix + ".partial")
with temporary.open("wb") as raw_output:
    with gzip.GzipFile(
        filename="",
        mode="wb",
        fileobj=raw_output,
        mtime=0,
        compresslevel=9,
    ) as compressed:
        with tarfile.open(
            fileobj=compressed,
            mode="w",
            format=tarfile.USTAR_FORMAT,
        ) as archive:
            for source, destination in sorted(
                sources,
                key=lambda item: item[1].as_posix(),
            ):
                payload = source.read_bytes()
                info = tarfile.TarInfo(destination.as_posix())
                info.size = len(payload)
                info.mtime = 0
                info.uid = 0
                info.gid = 0
                info.uname = "root"
                info.gname = "root"
                info.mode = 0o755 if destination.suffix in {".py", ".sh"} else 0o644
                archive.addfile(info, io.BytesIO(payload))

os.replace(temporary, output)
artifact_sha256 = hashlib.sha256(output.read_bytes()).hexdigest()
digest_path.write_text(
    f"{artifact_sha256}  {output.name}\n",
    encoding="utf-8",
)
print(artifact_sha256)
PYTHON
