#!/usr/bin/env python3
"""Initialize replication state or persist contiguous node-only diffs."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path
from typing import Optional, Sequence

import osmium
from osmium.replication.server import OsmosisState, ReplicationServer


STATE_SEQUENCE_PATTERN = re.compile(r"^sequenceNumber=(\d+)$", re.MULTILINE)
SimpleWriter = osmium.SimpleWriter


def parse_timestamp(value: str) -> dt.datetime:
    try:
        timestamp = dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "timestamp must use UTC ISO 8601 format, for example 2026-08-24T12:34:56Z"
        ) from error
    return timestamp.replace(tzinfo=dt.timezone.utc)


def parse_arguments(arguments: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)

    initialize = commands.add_parser("initialize")
    initialize.add_argument("--server", required=True)
    initialize.add_argument("--start-timestamp", required=True, type=parse_timestamp)
    initialize.add_argument("--pending-state", required=True)
    initialize.set_defaults(command_handler=initialize_state)

    update = commands.add_parser("update")
    update.add_argument("--server", required=True)
    update.add_argument("--state", required=True)
    update.add_argument("--pending-state", required=True)
    update.add_argument("--output", required=True)
    update.add_argument("--max-size-mb", required=True, type=int)
    update.set_defaults(command_handler=update_state)

    return parser.parse_args(arguments)


def read_sequence(path: Path) -> int:
    match = STATE_SEQUENCE_PATTERN.search(path.read_text(encoding="utf-8"))
    if match is None:
        raise RuntimeError(f"Replication state has no sequenceNumber: {path}")
    return int(match.group(1))


def write_state(path: Path, state: OsmosisState) -> None:
    if state.sequence < 0:
        raise RuntimeError(f"Replication sequence must not be negative: {state.sequence}")
    if state.timestamp.tzinfo is None or state.timestamp.utcoffset() is None:
        raise RuntimeError("Replication state timestamp must include a timezone")

    utc_timestamp = state.timestamp.astimezone(dt.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    escaped_timestamp = utc_timestamp.replace(":", r"\:")
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(
        f"sequenceNumber={state.sequence}\ntimestamp={escaped_timestamp}\n",
        encoding="utf-8",
    )
    temporary.chmod(0o640)
    temporary.replace(path)


class NodeOnlyHandler(osmium.SimpleHandler):
    def __init__(self, writer: object) -> None:
        super().__init__()
        self.writer = writer
        self.node_count = 0

    def node(self, node: osmium.osm.Node) -> None:
        self.writer.add_node(node)
        self.node_count += 1


def initialize_state(arguments: argparse.Namespace) -> int:
    pending_state_path = Path(arguments.pending_state)

    with ReplicationServer(arguments.server) as server:
        matching_sequence = server.timestamp_to_sequence(
            arguments.start_timestamp,
            limit_by_oldest_available=True,
        )
        if matching_sequence is None:
            raise RuntimeError(
                f"Unable to resolve replication sequence for {arguments.start_timestamp}"
            )

        cursor_sequence = max(0, matching_sequence - 1)
        cursor_state = server.get_state_info(cursor_sequence)
        if cursor_state is None or cursor_state.sequence != cursor_sequence:
            raise RuntimeError(
                f"Unable to read replication state for sequence {cursor_sequence}"
            )

    write_state(pending_state_path, cursor_state)
    print(cursor_state.sequence)
    return 0


def update_state(arguments: argparse.Namespace) -> int:
    state_path = Path(arguments.state)
    pending_state_path = Path(arguments.pending_state)
    output_path = Path(arguments.output)
    current_sequence = read_sequence(state_path)

    with ReplicationServer(arguments.server) as server:
        latest_state = server.get_state_info()
        if latest_state is None:
            raise RuntimeError("Unable to read the latest replication state")
        if current_sequence >= latest_state.sequence:
            return 3

        writer = SimpleWriter(str(output_path), overwrite=True)
        handler = NodeOnlyHandler(writer)
        try:
            applied_sequence = server.apply_diffs(
                handler,
                current_sequence + 1,
                max_size=arguments.max_size_mb * 1024,
                simplify=False,
            )
        finally:
            writer.close()

        if applied_sequence is None or applied_sequence <= current_sequence:
            raise RuntimeError("Replication server returned no contiguous change sequence")

        applied_state = server.get_state_info(applied_sequence)
        if applied_state is None or applied_state.sequence != applied_sequence:
            raise RuntimeError(f"Unable to read state for sequence {applied_sequence}")

    write_state(pending_state_path, applied_state)
    print(handler.node_count)
    return 0


def main(arguments: Optional[Sequence[str]] = None) -> int:
    parsed_arguments = parse_arguments(arguments)
    return parsed_arguments.command_handler(parsed_arguments)


if __name__ == "__main__":
    raise SystemExit(main())
