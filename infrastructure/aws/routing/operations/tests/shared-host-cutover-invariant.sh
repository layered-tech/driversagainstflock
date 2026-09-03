#!/usr/bin/env bash

set -euo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROUTING_DIRECTORY="$(cd "${TEST_DIRECTORY}/../.." && pwd)"

python3 - "${ROUTING_DIRECTORY}" <<'PYTHON'
from pathlib import Path
import sys

root = Path(sys.argv[1])
dns = (root / "dns.tf").read_text()
locals = (root / "locals.tf").read_text()
variables = (root / "variables.tf").read_text()

if 'graphhopper_private_ip = "10.0.3.10"' not in locals:
    raise SystemExit("GraphHopper DNS does not target the shared host")
if "records = [local.graphhopper_private_ip]" not in dns:
    raise SystemExit("GraphHopper DNS is not pinned to the shared host")
if "graphhopper_dns_private_ip" in variables or "10.0.2.10" in dns:
    raise SystemExit("GraphHopper DNS retains legacy-host compatibility configuration")
PYTHON

echo "routing-shared-host-cutover-invariants: PASS"
