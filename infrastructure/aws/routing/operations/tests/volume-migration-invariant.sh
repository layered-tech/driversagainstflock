#!/usr/bin/env bash

set -euo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROUTING_DIRECTORY="$(cd "${TEST_DIRECTORY}/../.." && pwd)"
readonly MIGRATION="${ROUTING_DIRECTORY}/operations/serving/v1.0.9/migrate-graph-volume.sh"

grep -qF 'NEW_DEVICE_SIZE < 64 * 1024 * 1024 * 1024' "${MIGRATION}"
grep -qF 'replacement graph volume is smaller than 64 GiB' "${MIGRATION}"
[[ "$(grep -cF 'rsync -aHAX --numeric-ids --delete' "${MIGRATION}")" == 2 ]]
grep -qF 'trap rollback EXIT' "${MIGRATION}"
grep -qF 'cp -a "${FSTAB_BACKUP}" /etc/fstab' "${MIGRATION}"
grep -qF 'findmnt -nro UUID "${GRAPH_MOUNT}"' "${MIGRATION}"
grep -qF 'curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8989/info' "${MIGRATION}"

python3 - "${ROUTING_DIRECTORY}" <<'PYTHON'
from pathlib import Path
import sys

root = Path(sys.argv[1])
storage = (root / "storage.tf").read_text()
compute = (root / "compute.tf").read_text()
moved = (root / "moved.tf").read_text()

for resource in ("graph_legacy", "graph_canonical"):
    start = storage.index(f'resource "aws_ebs_volume" "{resource}"')
    end = storage.find('\nresource "', start + 1)
    block = storage[start:] if end < 0 else storage[start:end]
    if "prevent_destroy = true" not in block:
        raise SystemExit(f"{resource} is not protected from destruction")

required = (
    "from = aws_ebs_volume.graphs",
    "to   = aws_ebs_volume.graph_legacy",
    "from = aws_volume_attachment.graphs",
    "to   = aws_volume_attachment.graph_legacy[0]",
)
if any(contract not in moved for contract in required):
    raise SystemExit("routing moved-block chain is incomplete")
if 'resource "aws_volume_attachment" "graph_migration"' not in compute:
    raise SystemExit("canonical graph migration attachment is missing")
if "count = var.attach_graph_legacy_volume ? 1 : 0" not in compute:
    raise SystemExit("legacy graph attachment cannot be disabled after migration")
if "throughput        = 125" not in storage:
    raise SystemExit("canonical graph volume throughput is not 125 MiB/s")
PYTHON

echo "routing-volume-migration-invariants: PASS"
