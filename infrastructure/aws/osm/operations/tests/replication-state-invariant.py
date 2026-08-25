#!/usr/bin/env python3
"""Network-free invariants for the node-only replication state CLI."""

from __future__ import annotations

import contextlib
import datetime as dt
import importlib.metadata
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from osmium.replication.server import OsmosisState


MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "bin" / "fetch-node-changes.py"
)
MODULE_SPEC = importlib.util.spec_from_file_location(
    "daf_osm_fetch_node_changes",
    MODULE_PATH,
)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load replication candidate: {MODULE_PATH}")
DOWNLOADER = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(DOWNLOADER)


class FakeWriter:
    instances: list[FakeWriter] = []

    def __init__(self, path: str, overwrite: bool) -> None:
        self.path = path
        self.overwrite = overwrite
        self.nodes: list[object] = []
        self.closed = False
        self.instances.append(self)

    def add_node(self, node: object) -> None:
        self.nodes.append(node)

    def close(self) -> None:
        self.closed = True


class FakeReplicationServer:
    instances: list[FakeReplicationServer] = []
    timestamp_sequence: int | None = None
    latest_state: OsmosisState | None = None
    states: dict[int, OsmosisState] = {}
    applied_sequence: int | None = None
    emitted_node_count = 0

    def __init__(self, server: str) -> None:
        self.server = server
        self.timestamp_calls: list[tuple[dt.datetime, bool]] = []
        self.state_calls: list[int | None] = []
        self.apply_calls: list[dict[str, object]] = []
        self.instances.append(self)

    def __enter__(self) -> FakeReplicationServer:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def timestamp_to_sequence(
        self,
        timestamp: dt.datetime,
        *,
        limit_by_oldest_available: bool = False,
    ) -> int | None:
        self.timestamp_calls.append((timestamp, limit_by_oldest_available))
        return self.timestamp_sequence

    def get_state_info(self, sequence: int | None = None) -> OsmosisState | None:
        self.state_calls.append(sequence)
        if sequence is None:
            return self.latest_state
        return self.states.get(sequence)

    def apply_diffs(
        self,
        handler: object,
        start_id: int,
        *,
        max_size: int,
        simplify: bool,
    ) -> int | None:
        self.apply_calls.append(
            {
                "start_id": start_id,
                "max_size": max_size,
                "simplify": simplify,
            }
        )
        for node_id in range(self.emitted_node_count):
            handler.node(SimpleNamespace(id=node_id + 1))
        return self.applied_sequence


class ReplicationStateInvariantTest(unittest.TestCase):
    def setUp(self) -> None:
        FakeWriter.instances = []
        FakeReplicationServer.instances = []
        FakeReplicationServer.timestamp_sequence = None
        FakeReplicationServer.latest_state = None
        FakeReplicationServer.states = {}
        FakeReplicationServer.applied_sequence = None
        FakeReplicationServer.emitted_node_count = 0

    def run_cli(self, arguments: list[str]) -> tuple[int, str]:
        output = io.StringIO()
        with (
            mock.patch.object(DOWNLOADER, "ReplicationServer", FakeReplicationServer),
            mock.patch.object(DOWNLOADER, "SimpleWriter", FakeWriter),
            contextlib.redirect_stdout(output),
        ):
            result = DOWNLOADER.main(arguments)
        return result, output.getvalue()

    def test_installed_pyosmium_version_is_pinned(self) -> None:
        self.assertEqual(importlib.metadata.version("osmium"), "4.3.1")

    def test_initialize_writes_overlapping_full_osmosis_state(self) -> None:
        start_timestamp = dt.datetime(2026, 8, 24, 12, 35, tzinfo=dt.timezone.utc)
        cursor_timestamp = dt.datetime(2026, 8, 24, 12, 34, 56, tzinfo=dt.timezone.utc)
        FakeReplicationServer.timestamp_sequence = 42
        FakeReplicationServer.states = {
            41: OsmosisState(sequence=41, timestamp=cursor_timestamp),
        }

        with tempfile.TemporaryDirectory() as directory:
            pending_state = Path(directory) / "history.pending.state"
            result, output = self.run_cli(
                [
                    "initialize",
                    "--server",
                    "https://example.invalid/replication/minute/",
                    "--start-timestamp",
                    "2026-08-24T12:35:00Z",
                    "--pending-state",
                    str(pending_state),
                ]
            )

            self.assertEqual(result, 0)
            self.assertEqual(output, "41\n")
            self.assertEqual(
                pending_state.read_text(encoding="utf-8"),
                "sequenceNumber=41\ntimestamp=2026-08-24T12\\:34\\:56Z\n",
            )

        server = FakeReplicationServer.instances[0]
        self.assertEqual(server.timestamp_calls, [(start_timestamp, True)])
        self.assertEqual(server.state_calls, [41])

    def test_initialize_clamps_overlap_cursor_to_zero(self) -> None:
        state_zero = OsmosisState(
            sequence=0,
            timestamp=dt.datetime(2020, 1, 1, tzinfo=dt.timezone.utc),
        )
        FakeReplicationServer.timestamp_sequence = 0
        FakeReplicationServer.states = {0: state_zero}

        with tempfile.TemporaryDirectory() as directory:
            pending_state = Path(directory) / "history.pending.state"
            result, output = self.run_cli(
                [
                    "initialize",
                    "--server",
                    "https://example.invalid/replication/minute/",
                    "--start-timestamp",
                    "2020-01-01T00:00:00Z",
                    "--pending-state",
                    str(pending_state),
                ]
            )

            self.assertEqual(result, 0)
            self.assertEqual(output, "0\n")
            self.assertIn("sequenceNumber=0\n", pending_state.read_text())

    def test_update_retains_intermediate_nodes_and_writes_full_state(self) -> None:
        latest_timestamp = dt.datetime(2026, 8, 24, 12, 37, tzinfo=dt.timezone.utc)
        FakeReplicationServer.latest_state = OsmosisState(
            sequence=43,
            timestamp=latest_timestamp,
        )
        FakeReplicationServer.states = {
            43: OsmosisState(sequence=43, timestamp=latest_timestamp),
        }
        FakeReplicationServer.applied_sequence = 43
        FakeReplicationServer.emitted_node_count = 2

        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "history.state"
            state.write_text(
                "sequenceNumber=41\ntimestamp=2026-08-24T12\\:34\\:56Z\n",
                encoding="utf-8",
            )
            pending_state = Path(directory) / "history.pending.state"
            output_path = Path(directory) / "nodes.osh.pbf"
            result, output = self.run_cli(
                [
                    "update",
                    "--server",
                    "https://example.invalid/replication/minute/",
                    "--state",
                    str(state),
                    "--pending-state",
                    str(pending_state),
                    "--output",
                    str(output_path),
                    "--max-size-mb",
                    "7",
                ]
            )

            self.assertEqual(result, 0)
            self.assertEqual(output, "2\n")
            self.assertEqual(
                pending_state.read_text(encoding="utf-8"),
                "sequenceNumber=43\ntimestamp=2026-08-24T12\\:37\\:00Z\n",
            )

        server = FakeReplicationServer.instances[0]
        self.assertEqual(server.state_calls, [None, 43])
        self.assertEqual(
            server.apply_calls,
            [{"start_id": 42, "max_size": 7 * 1024, "simplify": False}],
        )
        self.assertEqual(len(FakeWriter.instances), 1)
        self.assertEqual(len(FakeWriter.instances[0].nodes), 2)
        self.assertTrue(FakeWriter.instances[0].closed)


if __name__ == "__main__":
    unittest.main()
