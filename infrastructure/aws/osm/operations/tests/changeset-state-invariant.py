#!/usr/bin/env python3
"""Offline invariants for the changeset replication fetcher."""

from __future__ import annotations

import datetime as dt
import gzip
import importlib.util
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TEST_DIRECTORY = Path(__file__).resolve().parent
FETCHER_PATH = TEST_DIRECTORY.parent / "bin" / "fetch-changeset-diffs.py"
FIXTURE_PATH = TEST_DIRECTORY / "fixtures/changesets/007-172-783.state.txt"
SPEC = importlib.util.spec_from_file_location("fetch_changeset_diffs", FETCHER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load changeset fetcher")
fetcher = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = fetcher
SPEC.loader.exec_module(fetcher)


def state(sequence: int, timestamp: dt.datetime, fractional: bool = True) -> bytes:
    if fractional:
        rendered = timestamp.strftime("%Y-%m-%d %H:%M:%S.123456000 +00:00")
    else:
        rendered = timestamp.strftime("%Y-%m-%d %H:%M:%S +00:00")
    return f"---\nlast_run: {rendered}\nsequence: {sequence}\n".encode()


class FixtureServer:
    def __init__(self) -> None:
        self.routes: dict[str, tuple[int, bytes, dict[str, str]]] = {}
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                status, body, headers = fixture.routes.get(self.path, (404, b"", {}))
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_port}/"

    def __enter__(self) -> FixtureServer:
        self.thread.start()
        return self

    def __exit__(self, *args: object) -> None:
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()


class ChangesetStateInvariant(unittest.TestCase):
    def setUp(self) -> None:
        self.start = dt.datetime(2026, 9, 6, tzinfo=dt.timezone.utc)

    def populate(self, server: FixtureServer, first: int = 100, last: int = 110) -> None:
        server.routes["/state.yaml"] = (200, state(last, self.start + dt.timedelta(minutes=last - first)), {})
        for sequence in range(first, last + 1):
            path = fetcher.artifact_path(sequence)
            timestamp = self.start + dt.timedelta(minutes=sequence - first)
            server.routes[f"/{path}.state.txt"] = (200, state(sequence, timestamp), {})
            xml = f'<osm timestamp="{timestamp.isoformat()}"><changeset id="{sequence}"/></osm>'.encode()
            server.routes[f"/{path}.osm.gz"] = (200, gzip.compress(xml), {})

    def test_immutable_offset_fixture(self) -> None:
        captured = fetcher.parse_state(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(7172782, captured.sequence)
        self.assertEqual("007/172/783", fetcher.artifact_path(captured.sequence))

    def test_state_parses_fractional_and_whole_seconds(self) -> None:
        fractional = fetcher.parse_state(state(10, self.start).decode())
        whole = fetcher.parse_state(state(11, self.start, fractional=False).decode())
        self.assertEqual(10, fractional.sequence)
        self.assertEqual(11, whole.sequence)

    def test_initialize_brackets_and_binary_searches(self) -> None:
        with FixtureServer() as server, tempfile.TemporaryDirectory() as directory:
            self.populate(server)
            pending = Path(directory) / "pending.state"
            arguments = fetcher.parse_arguments(
                [
                    "initialize",
                    "--server",
                    server.url,
                    "--start-timestamp",
                    "2026-09-06T00:05:30Z",
                    "--pending-state",
                    str(pending),
                ]
            )
            self.assertEqual(0, fetcher.initialize(arguments))
            self.assertEqual(105, fetcher.read_osmosis_sequence(pending))
            self.assertIn("timestamp=2026-09-06T00\\:05\\:00Z", pending.read_text())

    def test_ruby_timestamp_precision_and_offset(self) -> None:
        for raw, expected in [
            ("2026-09-06 19:36:03.477062000 +00:00", "2026-09-06T19:36:03.477062+00:00"),
            ("2026-09-06 19:36:03.1 +02:00", "2026-09-06T17:36:03.100000+00:00"),
            ("2026-09-06 19:36:03 +00:00", "2026-09-06T19:36:03+00:00"),
        ]:
            with self.subTest(raw=raw):
                self.assertEqual(expected, fetcher.parse_timestamp(raw).isoformat())

    def test_update_downloads_contiguous_diffs_and_honors_limit(self) -> None:
        with FixtureServer() as server, tempfile.TemporaryDirectory() as directory:
            self.populate(server)
            root = Path(directory)
            local_state = root / "state.txt"
            pending = root / "pending.txt"
            output = root / "output"
            output.mkdir()
            fetcher.write_osmosis_state(
                local_state,
                fetcher.ChangesetState(105, self.start + dt.timedelta(minutes=5)),
            )
            arguments = fetcher.parse_arguments(
                [
                    "update",
                    "--server",
                    server.url,
                    "--state",
                    str(local_state),
                    "--pending-state",
                    str(pending),
                    "--output-directory",
                    str(output),
                    "--max-diffs",
                    "2",
                ]
            )
            self.assertEqual(0, fetcher.update(arguments))
            self.assertEqual(107, fetcher.read_osmosis_sequence(pending))
            self.assertEqual(
                ["changeset-106.osm.gz", "changeset-107.osm.gz"],
                sorted(path.name for path in output.iterdir()),
            )

    def test_update_at_head_returns_three(self) -> None:
        with FixtureServer() as server, tempfile.TemporaryDirectory() as directory:
            self.populate(server)
            root = Path(directory)
            local_state = root / "state.txt"
            output = root / "output"
            output.mkdir()
            fetcher.write_osmosis_state(
                local_state,
                fetcher.ChangesetState(110, self.start + dt.timedelta(minutes=10)),
            )
            arguments = fetcher.parse_arguments(
                [
                    "update",
                    "--server",
                    server.url,
                    "--state",
                    str(local_state),
                    "--pending-state",
                    str(root / "pending.txt"),
                    "--output-directory",
                    str(output),
                    "--max-diffs",
                    "2",
                ]
            )
            self.assertEqual(3, fetcher.update(arguments))

    def test_missing_diff_below_head_is_fatal_and_retry_is_safe(self) -> None:
        with FixtureServer() as server, tempfile.TemporaryDirectory() as directory:
            self.populate(server)
            root = Path(directory)
            local_state = root / "state.txt"
            pending = root / "pending.txt"
            output = root / "output"
            output.mkdir()
            fetcher.write_osmosis_state(
                local_state,
                fetcher.ChangesetState(105, self.start + dt.timedelta(minutes=5)),
            )
            missing_path = f"/{fetcher.artifact_path(107)}.osm.gz"
            saved_route = server.routes.pop(missing_path)
            arguments = fetcher.parse_arguments(
                [
                    "update",
                    "--server",
                    server.url,
                    "--state",
                    str(local_state),
                    "--pending-state",
                    str(pending),
                    "--output-directory",
                    str(output),
                    "--max-diffs",
                    "2",
                ]
            )
            with self.assertRaises(fetcher.MissingArtifact):
                fetcher.update(arguments)
            self.assertFalse(pending.exists())
            self.assertTrue((output / "changeset-106.osm.gz").is_file())

            server.routes[missing_path] = saved_route
            self.assertEqual(0, fetcher.update(arguments))
            self.assertEqual(107, fetcher.read_osmosis_sequence(pending))

    def test_redirects_and_companion_mismatch(self) -> None:
        with FixtureServer() as server:
            self.populate(server)
            path = fetcher.artifact_path(106)
            original = server.routes[f"/{path}.osm.gz"]
            server.routes[f"/{path}.osm.gz"] = (
                302,
                b"",
                {"Location": f"/redirected/{path}.osm.gz"},
            )
            server.routes[f"/redirected/{path}.osm.gz"] = original
            self.assertTrue(fetcher.fetch_bytes(server.url, f"{path}.osm.gz"))

            server.routes[f"/{path}.state.txt"] = (
                200,
                state(999, self.start),
                {},
            )
            with self.assertRaises(RuntimeError):
                fetcher.fetch_sequence_state(server.url, 106)

    def test_malformed_root_state_is_rejected(self) -> None:
        with FixtureServer() as server:
            server.routes["/state.yaml"] = (200, b"sequence: nope\n", {})
            with self.assertRaises(ValueError):
                fetcher.fetch_root_state(server.url)


if __name__ == "__main__":
    unittest.main(verbosity=2)
