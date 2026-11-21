#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OSM_DIRECTORY="$(cd "${TEST_DIRECTORY}/../.." && pwd)"
readonly MONITORING_TERRAFORM="${OSM_DIRECTORY}/unified-dashboard.tf"
readonly OSM_ALARMS_TERRAFORM="${OSM_DIRECTORY}/monitoring.tf"
readonly COST_CONTROLS_TERRAFORM="${OSM_DIRECTORY}/cost-controls.tf"
readonly ROUTING_DIRECTORY="${OSM_DIRECTORY}/../routing"
readonly ROUTING_SCHEDULER_TERRAFORM="${ROUTING_DIRECTORY}/scheduler.tf"

python3 - "${MONITORING_TERRAFORM}" "${OSM_ALARMS_TERRAFORM}" <<'PYTHON'
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


def alarm_resource(name: str) -> str:
    resource_start = re.search(
        rf'resource "aws_cloudwatch_metric_alarm" "{re.escape(name)}" \{{',
        alarms,
    )
    if resource_start is None:
        raise SystemExit(f"Missing CloudWatch alarm resource: {name}")

    next_resource = alarms.find(
        '\nresource "aws_cloudwatch_metric_alarm"',
        resource_start.end(),
    )
    return alarms[
        resource_start.start():next_resource if next_resource >= 0 else len(alarms)
    ]


alarms = Path(sys.argv[2]).read_text(encoding="utf-8")

metadata_alarm = alarm_resource("changeset_metadata_missing")
for name, expected in (("period", 3600), ("evaluation_periods", 48), ("datapoints_to_alarm", 48)):
    if not re.search(rf"\b{name}\s*=\s*{expected}\b", metadata_alarm):
        raise SystemExit(f"Metadata alarm must use {name}={expected} for a 48-hour allowance")
if 'statistic           = "Minimum"' not in metadata_alarm:
    raise SystemExit("Metadata alarm must tolerate temporary metadata gaps")
if 'alarm_description   = "Tracked OSM changesets have lacked metadata for 48 hours"' not in metadata_alarm:
    raise SystemExit("Metadata alarm description must match its 48-hour allowance")

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

if '"GraphHopper serving capacity"' in monitoring:
    raise SystemExit("Dashboard must not present host RAM as GraphHopper serving capacity")

if '"MemoryUsedPercent"' in monitoring:
    raise SystemExit("Dashboard must not use the agent memory metric that excludes shared memory")

for metric in ("ServingMemoryUsedPercent", "ServingGraphVolumeUsedPercent"):
    if monitoring.count(f'"{metric}"') != 1 or f'"{metric}"' not in metric_widget("Shared-host health"):
        raise SystemExit(f"{metric} must appear only in Shared-host health")

if not re.search(
    r'\["DAF/Routing", "ServingMemoryUsedPercent", "InstanceId", aws_instance\.database\.id, '
    r'\{ label = "Shared-host memory used \(%; includes shared memory\)" \}\]',
    metric_widget("Shared-host health"),
):
    raise SystemExit("Shared-host memory must use the MemAvailable-based routing metric")

for title in ("Shared-host health", "Publication and history volume"):
    if not re.search(r"\bstacked\s*=\s*false\b", metric_widget(title)):
        raise SystemExit(f"Dashboard metric widget {title!r} must remain unstacked")

for title in ("Minute replication", "History, backups, and parity"):
    if not re.search(
        r'\blegend\s*=\s*\{\s*position\s*=\s*"right"\s*\}',
        metric_widget(title),
    ):
        raise SystemExit(f"Dashboard metric widget {title!r} must keep its right-side legend")

for name, expected_settings in (
    ("postgresql_health", {
        "metric_name": '"PostgreSQLUp"',
        "statistic": '"Minimum"',
        "period": "60",
        "evaluation_periods": "3",
        "datapoints_to_alarm": "3",
        "threshold": "1",
        "comparison_operator": '"LessThanThreshold"',
        "treat_missing_data": '"notBreaching"',
    }),
    ("metrics_missing", {
        "metric_name": '"PostgreSQLUp"',
        "statistic": '"SampleCount"',
        "period": "300",
        "evaluation_periods": "3",
        "datapoints_to_alarm": "3",
        "threshold": "1",
        "comparison_operator": '"LessThanThreshold"',
        "treat_missing_data": '"breaching"',
        "alarm_actions": "[aws_sns_topic.alerts.arn]",
        "ok_actions": "[aws_sns_topic.alerts.arn]",
    }),
    ("retained_spool", {
        "metric_name": '"SharedFeedOldestRetainedBatchAgeSeconds"',
        "period": "300",
        "evaluation_periods": "3",
        "datapoints_to_alarm": "2",
        "threshold": "600",
        "treat_missing_data": '"notBreaching"',
    }),
    ("backup_freshness", {"threshold": "108000"}),
):
    alarm = alarm_resource(name)
    for setting, expected in expected_settings.items():
        if not re.search(rf"^\s*{setting}\s*=\s*{re.escape(expected)}$", alarm, re.MULTILINE):
            raise SystemExit(f"Alarm {name} must use {setting}={expected}")

if "aws_cloudwatch_metric_alarm.metrics_missing.alarm_name" not in monitoring:
    raise SystemExit("Unified dashboard must display the missing metrics alarm")

history_widget = metric_widget("History, backups, and parity")
for metric_name in (
    "SharedFeedRetainedBatchCount",
    "SharedFeedOldestRetainedBatchAgeSeconds",
):
    if metric_name not in history_widget:
        raise SystemExit(f"History dashboard is missing {metric_name}")

publication_parity_alarm = alarm_resource("publication_parity")
if 'treat_missing_data  = "notBreaching"' not in publication_parity_alarm:
    raise SystemExit("Publication parity must ignore omitted in-flight samples")

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

[[ "$(rg --count 'alarm_name\s*=\s*"daf-infrastructure-' "${OSM_ALARMS_TERRAFORM}" "${ROUTING_SCHEDULER_TERRAFORM}" | awk -F: '{ total += $2 } END { print total }')" == 23 ]]
[[ "$(rg --count 'create_before_destroy\s*=\s*true' "${OSM_ALARMS_TERRAFORM}" "${ROUTING_SCHEDULER_TERRAFORM}" | awk -F: '{ total += $2 } END { print total }')" == 23 ]]

for metric in \
    ChangesetConsumerLagSeconds \
    ChangesetConsumerFailures \
    ChangesetCount \
    ChangesetDiscussionCommentCount \
    ChangesetConsumerSequence \
    ChangesetsMissingMetadata \
    ChangesetFeedRetainedCount \
    ChangesetFeedDiscussionCommentCount \
    ChangesetBackfillFailures; do
    grep --fixed-strings --quiet "\"${metric}\"" "${MONITORING_TERRAFORM}"
done

for alarm in \
    changeset_consumer_stale \
    changeset_consumer_failure \
    changeset_metadata_missing \
    changeset_backfill_failure; do
    grep --fixed-strings --quiet "aws_cloudwatch_metric_alarm.${alarm}.arn" "${MONITORING_TERRAFORM}"
done

if rg --quiet 'resource "aws_budgets_budget"' "${ROUTING_DIRECTORY}" --glob '*.tf'; then
    echo "A duplicate routing-only budget remains configured" >&2
    exit 1
fi
