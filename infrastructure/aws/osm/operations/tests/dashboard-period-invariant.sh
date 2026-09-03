#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OSM_DIRECTORY="$(cd "${TEST_DIRECTORY}/../.." && pwd)"
readonly MONITORING_TERRAFORM="${OSM_DIRECTORY}/unified-dashboard.tf"
readonly OSM_ALARMS_TERRAFORM="${OSM_DIRECTORY}/monitoring.tf"
readonly COST_CONTROLS_TERRAFORM="${OSM_DIRECTORY}/cost-controls.tf"
readonly ROUTING_DIRECTORY="${OSM_DIRECTORY}/../routing"
readonly ROUTING_SCHEDULER_TERRAFORM="${ROUTING_DIRECTORY}/scheduler.tf"

python3 - "${MONITORING_TERRAFORM}" <<'PYTHON'
from __future__ import annotations

import re
import sys
from pathlib import Path


monitoring = Path(sys.argv[1]).read_text(encoding="utf-8")
metric_widget_titles = (
    "Shared-host health",
    "Canonical OSM data volume",
    "Canonical GraphHopper volume",
    "Minute replication",
    "Publication and history volume",
    "History, backups, and parity",
    "GraphHopper serving capacity",
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

for title in ("Shared-host health", "Publication and history volume"):
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

grep --fixed-strings --quiet 'dashboard_name = "daf-infrastructure"' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'title = "DAF unified alarms"' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'SOURCE '\''/daf-routing/serving'\''' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'SOURCE '\''/daf-routing/builder'\''' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'fields @timestamp, @message, @log, @logStream' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'filter @message not like' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'data.terraform_remote_state.routing.outputs.graph_artifact_bucket' "${MONITORING_TERRAFORM}"
grep --fixed-strings --quiet 'limit_amount     = "150"' "${COST_CONTROLS_TERRAFORM}"
grep --fixed-strings --quiet 'values = ["daf-osm", "daf-routing"]' "${COST_CONTROLS_TERRAFORM}"
grep --fixed-strings --quiet 'Whole DAF stack monthly budget: **$150**' "${MONITORING_TERRAFORM}"

if rg --quiet 'alarm_name\s*=\s*"daf-(osm|routing)-' \
    "${OSM_ALARMS_TERRAFORM}" "${ROUTING_SCHEDULER_TERRAFORM}"; then
    echo "CloudWatch alarm names retain a pre-unification prefix" >&2
    exit 1
fi

[[ "$(rg --count 'alarm_name\s*=\s*"daf-infrastructure-' "${OSM_ALARMS_TERRAFORM}" "${ROUTING_SCHEDULER_TERRAFORM}" | awk -F: '{ total += $2 } END { print total }')" == 18 ]]
[[ "$(rg --count 'create_before_destroy\s*=\s*true' "${OSM_ALARMS_TERRAFORM}" "${ROUTING_SCHEDULER_TERRAFORM}" | awk -F: '{ total += $2 } END { print total }')" == 18 ]]

if rg --quiet 'resource "aws_budgets_budget"' "${ROUTING_DIRECTORY}" --glob '*.tf'; then
    echo "A duplicate routing-only budget remains configured" >&2
    exit 1
fi
