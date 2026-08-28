#!/usr/bin/env python3
"""Validate deployable size and cross-stack safety of the OSM IAM policies."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


MANAGED_POLICY_CHARACTER_LIMIT = 6_144
REPOSITORY = Path(__file__).resolve().parents[5]
IAM_DIRECTORY = REPOSITORY / "infrastructure/aws/iam"
POLICY_PATHS = {
    "boundary": IAM_DIRECTORY / "daf-osm-workload-boundary.json",
    "infrastructure": IAM_DIRECTORY / "daf-osm-infrastructure-policy.json",
    "services": IAM_DIRECTORY / "daf-osm-services-policy.json",
    "monitoring": IAM_DIRECTORY / "daf-osm-monitoring-policy.json",
}
PUBLIC_HOSTED_ZONE_ARN = "arn:aws:route53:::hostedzone/Z06275341CPJ6OSABH1X6"
ROUTING_PRIVATE_HOSTED_ZONE_ID = "Z056780730J8BLDZLRB99"
OSM_DASHBOARD_ARN = "arn:aws:cloudwatch::326364278889:dashboard/daf-osm"
OSM_TOPIC_ARN = "arn:aws:sns:us-east-1:326364278889:daf-osm-*"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def load_policy(path: Path) -> dict[str, Any]:
    policy = json.loads(path.read_text(encoding="utf-8"))
    compact = json.dumps(policy, separators=(",", ":"), ensure_ascii=False)
    require(
        len(compact) <= MANAGED_POLICY_CHARACTER_LIMIT,
        f"{path.name} has {len(compact)} non-whitespace characters; "
        f"IAM allows {MANAGED_POLICY_CHARACTER_LIMIT}",
    )

    statements = policy.get("Statement")
    require(isinstance(statements, list) and statements, f"{path.name} has no statements")
    statement_ids = [statement.get("Sid") for statement in statements]
    require(all(statement_ids), f"{path.name} has a statement without a Sid")
    require(
        len(statement_ids) == len(set(statement_ids)),
        f"{path.name} has duplicate statement Sids",
    )

    print(f"{path.name}: {len(compact)}/{MANAGED_POLICY_CHARACTER_LIMIT}")
    return policy


def statement_by_sid(policy: dict[str, Any], sid: str) -> dict[str, Any]:
    matches = [statement for statement in policy["Statement"] if statement["Sid"] == sid]
    require(len(matches) == 1, f"Expected exactly one {sid} statement")
    return matches[0]


def main() -> int:
    policies = {name: load_policy(path) for name, path in POLICY_PATHS.items()}

    services_json = json.dumps(policies["services"], separators=(",", ":"))
    require(
        ROUTING_PRIVATE_HOSTED_ZONE_ID not in services_json,
        "OSM policy must not deny or capture the routing private hosted zone",
    )
    public_zone_guard = statement_by_sid(
        policies["services"], "ProtectExistingPublicHostedZone"
    )
    require(public_zone_guard["Effect"] == "Deny", "Public hosted-zone guard must deny")
    require(
        public_zone_guard["Resource"] == PUBLIC_HOSTED_ZONE_ARN,
        "Public hosted-zone guard has the wrong target",
    )

    dashboard = statement_by_sid(policies["monitoring"], "ManageOsmDashboard")
    require(
        dashboard["Resource"] == OSM_DASHBOARD_ARN,
        "Dashboard mutations must target only the daf-osm dashboard",
    )
    dashboard_list = statement_by_sid(policies["monitoring"], "ListOsmDashboards")
    require(
        dashboard_list["Action"] == "cloudwatch:ListDashboards"
        and dashboard_list["Resource"] == "*",
        "Only dashboard listing may use an unscoped resource",
    )

    subscriptions = statement_by_sid(policies["monitoring"], "ManageOsmSubscriptions")
    require(
        subscriptions["Resource"] == OSM_TOPIC_ARN,
        "Subscription operations must remain scoped to daf-osm topics",
    )

    print("OSM IAM policy invariants passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
