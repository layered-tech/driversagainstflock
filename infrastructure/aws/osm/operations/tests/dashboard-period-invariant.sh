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


def metric_widget(title: str) -> str:
    title_match = re.search(rf'\btitle\s*=\s*"{re.escape(title)}"', monitoring)
    if title_match is None:
        raise SystemExit(f"Missing dashboard metric widget: {title}")

    properties_position = monitoring.rfind("        properties = {", 0, title_match.start())
    widget_end = monitoring.find("\n        }\n      }", title_match.end())
    if properties_position < 0 or widget_end < 0:
        raise SystemExit(f"Could not isolate dashboard metric widget: {title}")

    return monitoring[properties_position:widget_end]

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

for title in ("Database instance health", "Publication and history volume"):
    if not re.search(r"\bstacked\s*=\s*false\b", metric_widget(title)):
        raise SystemExit(f"Dashboard metric widget {title!r} must remain unstacked")

for title in ("Minute replication", "History, backups, and parity"):
    if not re.search(
        r'\blegend\s*=\s*\{\s*position\s*=\s*"right"\s*\}',
        metric_widget(title),
    ):
        raise SystemExit(f"Dashboard metric widget {title!r} must keep its right-side legend")

print("Dashboard metric widget cadence and display contracts are preserved")
PYTHON
