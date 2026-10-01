#!/usr/bin/env python3
"""Exercise service memory accounting and the shared-host tuning contract."""

import importlib.util
import tempfile
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("host_memory", ROOT / "bin/collect-host-memory.py")
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class HostMemoryInvariant(unittest.TestCase):
    def test_shared_memory_counted_once_and_reclaimable_cache_excluded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / "system.slice/graphhopper.service"
            directory.mkdir(parents=True)
            (directory / "memory.current").write_text("9000\n")
            (directory / "memory.stat").write_text(
                "anon 1000\nfile 7000\nshmem 4000\nkernel 500\nfile_mapped 6500\n"
            )
            values = {m["MetricName"]: m["Value"] for m in collector.collect_metrics("i-test", root, {})}
            self.assertEqual(5500, values["GraphHopperWorkingMemoryBytes"])
            self.assertEqual(9000, values["GraphHopperMemoryBytes"])

    def test_inactive_jobs_are_zero_and_missing_servers_are_not_reported_as_healthy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            metrics = collector.collect_metrics("i-test", Path(temporary), {})
            values = {m["MetricName"]: m["Value"] for m in metrics}
            self.assertNotIn("GraphHopperWorkingMemoryBytes", values)
            self.assertNotIn("PostgreSQLWorkingMemoryBytes", values)
            self.assertEqual(0, values["OsmChangesetRefreshWorkingMemoryBytes"])

    def test_heap_and_gc_metrics_have_correct_units_and_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            metrics = collector.collect_metrics("i-test", Path(temporary), {
                "jvm.memory.heap.used": {"value": 123},
                "jvm.gc.ZGC-Pauses.time": {"value": 12},
            })
            indexed = {m["MetricName"]: m for m in metrics}
            self.assertEqual("Bytes", indexed["GraphHopperHeapUsedBytes"]["Unit"])
            self.assertEqual("Milliseconds", indexed["GraphHopperGcPauseMilliseconds"]["Unit"])
            self.assertEqual([{"Name": "InstanceId", "Value": "i-test"}], metrics[0]["Dimensions"])

    def test_tuned_defaults_and_memory_alarm(self) -> None:
        installer = (ROOT / "install-core.sh").read_text()
        for setting in ("shared_buffers = '1GB'", "effective_cache_size = '3GB'",
                        "maintenance_work_mem = '256MB'", "autovacuum_work_mem = '128MB'"):
            self.assertIn(setting, installer)
        self.assertIn("OSM2PGSQL_CACHE_MB=256", (ROOT / "daf-osm.env").read_text())
        self.assertIn("-Xms1g -Xmx2g -XX:+UseZGC", (ROOT / "install-graphhopper.sh").read_text())
        self.assertIn("collect-host-memory.py", (ROOT / "bin/publish-routing-serving-metrics.sh").read_text())
        metrics = (ROOT / "bin/metrics.sh").read_text()
        self.assertIn('WHERE datname = current_database()', metrics)
        for name in ("PostgreSQLTempBytes", "PostgreSQLBlocksRead", "PostgreSQLBlocksHit"):
            self.assertIn(name, metrics)
        monitoring = (ROOT.parent / "monitoring.tf").read_text()
        alarm = monitoring.split('resource "aws_cloudwatch_metric_alarm" "memory_usage"')[1].split('\nresource ')[0]
        self.assertIn('namespace           = "DAF/Routing"', alarm)
        self.assertIn('metric_name         = "ServingMemoryUsedPercent"', alarm)

    def test_database_tuning_waits_for_activating_oneshot_jobs(self) -> None:
        script = (ROOT / "tune-shared-host-memory.sh").read_text()
        function = script.split("service_is_running() {")[1].split("\n}\n", 1)[0]
        for state in ("active", "activating", "deactivating", "reloading", "inactive", "failed"):
            completed = subprocess.run(["bash", "-c", "systemctl() { echo \"$STATE\"; }; "
                + "service_is_running() {" + function + "\n}; service_is_running example.service"],
                env={"STATE": state}, capture_output=True)
            self.assertEqual(0 if state in ("active", "activating", "deactivating", "reloading") else 1,
                             completed.returncode)
        self.assertLess(script.index('systemctl stop "${timers_to_restart[@]}"'),
                        script.index("service_is_running \"${service}\" || break"))
        self.assertLess(script.index("flock --timeout 60 10"), script.index('cat >> "${configuration_path}"'))
        self.assertIn('cp -a "${BACKUP_DIRECTORY}/postgresql.conf" "${configuration_path}"', script)

    def test_root_refresh_runs_queries_as_the_peer_authenticated_ingest_user(self) -> None:
        script = (ROOT / "bin/refresh-changesets.sh").read_text()
        function = script.split("psql_osm()\n{")[1].split("\n}\n", 1)[0]
        completed = subprocess.run(["bash", "-c", "runuser() { printf '%s\\n' \"$@\"; }; "
            + "psql_osm() {" + function + '\n}; psql_osm "--command=SELECT 1"'],
            capture_output=True, text=True, check=True)
        self.assertEqual(["--preserve-environment", "--user", "osm_ingest", "--", "psql",
                          "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command=SELECT 1"],
                         completed.stdout.splitlines())


if __name__ == "__main__":
    unittest.main()
