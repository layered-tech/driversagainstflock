#!/usr/bin/env python3
"""Initialize or download the independent OSM changeset replication stream."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path


STATE_FIELD = re.compile(r"^(last_run|sequence):\s*(.+?)\s*$")
OSMOSIS_SEQUENCE = re.compile(r"^sequenceNumber=(\d+)$", re.MULTILINE)


class MissingArtifact(RuntimeError):
    """A requested replication artifact does not exist."""


@dataclass(frozen=True)
class ChangesetState:
    sequence: int
    timestamp: dt.datetime


def parse_timestamp(value: str) -> dt.datetime:
    normalized = value.strip()
    normalized = re.sub(r"\s+([+-]\d{2}:\d{2})$", r"\1", normalized)
    normalized = re.sub(
        r"\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)",
        lambda match: "." + match.group(1)[:6].ljust(6, "0"),
        normalized,
    )
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        timestamp = dt.datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ValueError("invalid last_run timestamp") from error
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ValueError("last_run timestamp has no timezone")
    return timestamp.astimezone(dt.timezone.utc)


def parse_cli_timestamp(value: str) -> dt.datetime:
    try:
        return parse_timestamp(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("start-timestamp must be ISO 8601") from error


def parse_state(content: str) -> ChangesetState:
    fields: dict[str, str] = {}
    for line in content.splitlines():
        match = STATE_FIELD.match(line)
        if match is not None:
            fields[match.group(1)] = match.group(2)
    if set(fields) != {"last_run", "sequence"}:
        raise ValueError("changeset state must contain last_run and sequence")
    try:
        sequence = int(fields["sequence"])
    except ValueError as error:
        raise ValueError("invalid changeset sequence") from error
    if sequence < 0:
        raise ValueError("negative changeset sequence")
    return ChangesetState(sequence, parse_timestamp(fields["last_run"]))


def parse_arguments(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)

    initialize = commands.add_parser("initialize")
    initialize.add_argument("--server", required=True)
    initialize.add_argument("--start-timestamp", required=True, type=parse_cli_timestamp)
    initialize.add_argument("--pending-state", required=True, type=Path)

    update = commands.add_parser("update")
    update.add_argument("--server", required=True)
    update.add_argument("--state", required=True, type=Path)
    update.add_argument("--pending-state", required=True, type=Path)
    update.add_argument("--output-directory", required=True, type=Path)
    update.add_argument("--max-diffs", required=True, type=int)

    return parser.parse_args(arguments)


def artifact_path(logical_sequence: int) -> str:
    if logical_sequence < 0:
        raise ValueError("logical sequence must not be negative")
    artifact = logical_sequence + 1
    digits = f"{artifact:09d}"
    if len(digits) != 9:
        raise ValueError("artifact number exceeds nine digits")
    return f"{digits[:3]}/{digits[3:6]}/{digits[6:]}"


def url(server: str, relative_path: str) -> str:
    return urllib.parse.urljoin(f"{server.rstrip('/')}/", relative_path)


def fetch_bytes(server: str, relative_path: str) -> bytes:
    request = urllib.request.Request(
        url(server, relative_path),
        headers={"User-Agent": "DriversAgainstFlock-OSM/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
    except urllib.error.HTTPError as error:
        error.close()
        if error.code == 404:
            raise MissingArtifact(f"missing artifact: {relative_path}") from error
        raise RuntimeError(f"HTTP {error.code} for replication artifact") from error
    except urllib.error.URLError as error:
        raise RuntimeError("unable to fetch replication artifact") from error
    if not content:
        raise RuntimeError(f"empty replication artifact: {relative_path}")
    return content


def fetch_root_state(server: str) -> ChangesetState:
    try:
        return parse_state(fetch_bytes(server, "state.yaml").decode("utf-8"))
    except UnicodeDecodeError as error:
        raise RuntimeError("root changeset state is not UTF-8") from error


def fetch_sequence_state(server: str, sequence: int) -> ChangesetState:
    relative_path = f"{artifact_path(sequence)}.state.txt"
    try:
        state = parse_state(fetch_bytes(server, relative_path).decode("utf-8"))
    except UnicodeDecodeError as error:
        raise RuntimeError("companion changeset state is not UTF-8") from error
    if state.sequence != sequence:
        raise RuntimeError(
            f"companion state sequence mismatch for logical sequence {sequence}"
        )
    return state


def read_osmosis_sequence(path: Path) -> int:
    match = OSMOSIS_SEQUENCE.search(path.read_text(encoding="utf-8"))
    if match is None:
        raise RuntimeError("local replication state has no sequenceNumber")
    return int(match.group(1))


def write_osmosis_state(path: Path, state: ChangesetState) -> None:
    timestamp = state.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ").replace(":", r"\:")
    partial = path.with_suffix(f"{path.suffix}.partial")
    partial.write_text(
        f"sequenceNumber={state.sequence}\ntimestamp={timestamp}\n",
        encoding="utf-8",
    )
    partial.chmod(0o640)
    partial.replace(path)


def find_earliest_existing(
    server: str,
    missing_sequence: int,
    known_existing_sequence: int,
) -> ChangesetState:
    lower = missing_sequence + 1
    upper = known_existing_sequence
    while lower < upper:
        candidate = (lower + upper) // 2
        try:
            fetch_sequence_state(server, candidate)
        except MissingArtifact:
            lower = candidate + 1
        else:
            upper = candidate
    return fetch_sequence_state(server, lower)


def initialize(arguments: argparse.Namespace) -> int:
    head = fetch_root_state(arguments.server)
    target = arguments.start_timestamp
    if target >= head.timestamp:
        write_osmosis_state(arguments.pending_state, head)
        print(f"sequence={head.sequence}")
        return 0

    high = head
    step = 1
    low: ChangesetState | None = None
    while low is None:
        candidate_sequence = max(0, head.sequence - step)
        try:
            candidate = fetch_sequence_state(arguments.server, candidate_sequence)
        except MissingArtifact:
            earliest = find_earliest_existing(
                arguments.server,
                candidate_sequence,
                high.sequence,
            )
            if earliest.timestamp > target:
                raise RuntimeError("start timestamp predates available replication state")
            low = earliest
            break

        if candidate.timestamp <= target:
            low = candidate
        else:
            high = candidate
            if candidate_sequence == 0:
                raise RuntimeError("start timestamp predates available replication state")
            step *= 2

    while low.sequence + 1 < high.sequence:
        candidate_sequence = (low.sequence + high.sequence) // 2
        candidate = fetch_sequence_state(arguments.server, candidate_sequence)
        if candidate.timestamp <= target:
            low = candidate
        else:
            high = candidate

    write_osmosis_state(arguments.pending_state, low)
    print(f"sequence={low.sequence}")
    return 0


def update(arguments: argparse.Namespace) -> int:
    if arguments.max_diffs <= 0:
        raise RuntimeError("max-diffs must be positive")
    if not arguments.output_directory.is_dir():
        raise RuntimeError("output-directory must already exist")

    applied = read_osmosis_sequence(arguments.state)
    head = fetch_root_state(arguments.server)
    if applied >= head.sequence:
        return 3

    terminal_sequence = min(head.sequence, applied + arguments.max_diffs)
    downloaded = 0
    terminal_state: ChangesetState | None = None
    for sequence in range(applied + 1, terminal_sequence + 1):
        terminal_state = fetch_sequence_state(arguments.server, sequence)
        relative_path = f"{artifact_path(sequence)}.osm.gz"
        content = fetch_bytes(arguments.server, relative_path)
        destination = arguments.output_directory / f"changeset-{sequence}.osm.gz"
        partial = destination.with_suffix(f"{destination.suffix}.partial")
        partial.write_bytes(content)
        partial.chmod(0o640)
        partial.replace(destination)
        downloaded += 1

    if terminal_state is None:
        raise RuntimeError("no changeset diffs were downloaded")
    write_osmosis_state(arguments.pending_state, terminal_state)
    print(f"diffs={downloaded} sequence={terminal_state.sequence}")
    return 0


def main(arguments: Sequence[str] | None = None) -> int:
    parsed = parse_arguments(arguments)
    if parsed.command == "initialize":
        return initialize(parsed)
    return update(parsed)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
