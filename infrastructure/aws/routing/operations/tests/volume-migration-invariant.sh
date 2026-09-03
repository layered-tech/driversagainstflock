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

canonical_start = storage.index('resource "aws_ebs_volume" "graph_canonical"')
canonical = storage[canonical_start:]
if "prevent_destroy = true" not in canonical:
    raise SystemExit("canonical graph volume is not protected from destruction")
if "graph_legacy" in storage:
    raise SystemExit("retired legacy graph volume remains configured")
if 'resource "aws_volume_attachment"' in compute:
    raise SystemExit("routing root retains a legacy serving-host volume attachment")
variables = (root / "variables.tf").read_text()
if "attach_graph_legacy_volume" in variables or "attach_graph_volume_to_routing_host" in variables:
    raise SystemExit("routing root retains migration-only attachment variables")
if "throughput        = 125" not in storage:
    raise SystemExit("canonical graph volume throughput is not 125 MiB/s")
PYTHON

echo "routing-volume-migration-invariants: PASS"
