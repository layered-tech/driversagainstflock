#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OSM_DIRECTORY="$(cd "${TEST_DIRECTORY}/../.." && pwd)"
readonly MONITORING_TERRAFORM="${OSM_DIRECTORY}/monitoring.tf"

python3 - "${MONITORING_TERRAFORM}" <<'PYTHON'
from __future__ import annotations

import re
import sys
from pathlib import Path


monitoring = Path(sys.argv[1]).read_text(encoding="utf-8")
metric_widget_titles = (
    "Database instance health",
    "Persistent database volume",
    "Minute replication",
    "Publication and history volume",
    "History, backups, and parity",
)

for title in metric_widget_titles:
    title_match = re.search(rf'\btitle\s*=\s*"{re.escape(title)}"', monitoring)
    if title_match is None:
        raise SystemExit(f"Missing dashboard metric widget: {title}")
    title_position = title_match.start()

    periods = re.findall(r"\bperiod\s*=\s*([0-9]+)", monitoring[:title_position])
    if not periods or periods[-1] != "60":
        actual_period = periods[-1] if periods else "missing"
        raise SystemExit(
            f"Dashboard metric widget {title!r} must use the 60-second source cadence; "
            f"found {actual_period}"
        )

print("Dashboard metric widget periods match one-minute source cadences")
PYTHON
