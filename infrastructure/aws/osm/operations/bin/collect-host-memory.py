#!/usr/bin/env python3
"""Collect physical service memory without double-counting ZGC mappings."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from pathlib import Path


SERVICES = {
    "GraphHopper": "graphhopper.service",
    "PostgreSQL": "postgresql.service",
    "OsmReplication": "daf-osm-global-update.service",
    "OsmChangesetReplication": "daf-osm-changeset-update.service",
    "OsmChangesetBackfill": "daf-osm-changeset-backfill.service",
    "OsmChangesetRefresh": "daf-osm-changeset-refresh.service",
    "OsmBackup": "daf-osm-backup.service",
}
JVM_GAUGES = {
    "GraphHopperHeapUsedBytes": "jvm.memory.heap.used",
    "GraphHopperHeapCommittedBytes": "jvm.memory.heap.committed",
    "GraphHopperHeapMaxBytes": "jvm.memory.heap.max",
    "GraphHopperGcPauseMilliseconds": "jvm.gc.ZGC-Pauses.time",
    "GraphHopperGcCycleMilliseconds": "jvm.gc.ZGC-Cycles.time",
}


def service_memory(root: Path, service: str) -> tuple[int, int] | None:
    directory = root / "system.slice" / service
    try:
        total = int((directory / "memory.current").read_text().strip())
        statistics = dict(line.split() for line in (directory / "memory.stat").read_text().splitlines())
        working = sum(int(statistics[name]) for name in ("anon", "shmem", "kernel"))
        return total, working
    except FileNotFoundError:
        # Inactive oneshot services have no cgroup and consume no memory.
        return None


def collect_metrics(instance_id: str, root: Path, gauges: dict) -> list[dict]:
    metrics = []

    def add(name: str, value: int, unit: str = "Bytes") -> None:
        if value < 0:
            raise ValueError(f"Negative memory metric: {name}")
        metrics.append({
            "MetricName": name,
            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
            "Unit": unit,
            "Value": value,
        })

    for prefix, service in SERVICES.items():
        memory = service_memory(root, service)
        if memory is None:
            if prefix in ("GraphHopper", "PostgreSQL"):
                continue
            memory = (0, 0)
        total, working = memory
        add(f"{prefix}WorkingMemoryBytes", working)
        if prefix in ("GraphHopper", "PostgreSQL"):
            add(f"{prefix}MemoryBytes", total)

    for metric_name, gauge_name in JVM_GAUGES.items():
        if gauge_name in gauges:
            unit = "Milliseconds" if metric_name.endswith("Milliseconds") else "Bytes"
            add(metric_name, int(gauges[gauge_name]["value"]), unit)

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--base-metrics", required=True, type=Path)
    arguments = parser.parse_args()
    gauges = {}
    try:
        with urllib.request.urlopen("http://127.0.0.1:8990/metrics", timeout=3) as response:
            gauges = json.load(response).get("gauges", {})
    except (OSError, ValueError, urllib.error.URLError):
        # Host and service metrics remain available while GraphHopper restarts.
        pass
    metrics = json.loads(arguments.base_metrics.read_text())
    metrics.extend(collect_metrics(arguments.instance_id, Path("/sys/fs/cgroup"), gauges))
    print(json.dumps(metrics))


if __name__ == "__main__":
    main()
