#!/usr/bin/env python3
"""Stream OSM changeset XML and complete discussions into PostgreSQL staging."""

from __future__ import annotations

import argparse
import bz2
import csv
import datetime as dt
import gzip
import io
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections.abc import Iterator, Sequence
from contextlib import ExitStack
from pathlib import Path
from typing import Any, BinaryIO


STAGE_COLUMNS = (
    "osm_changeset_id",
    "created_at",
    "closed_at",
    "open",
    "num_changes",
    "comments_count",
    "osm_uid",
    "osm_user",
    "min_lon",
    "min_lat",
    "max_lon",
    "max_lat",
    "tags",
    "source",
    "replication_sequence",
    "observed_at",
    "discussion",
)


class NulReplacingReader(io.RawIOBase):
    """Replace raw NUL bytes before XML parsing without buffering the input."""

    def __init__(self, source: BinaryIO) -> None:
        self.source = source

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        return self.source.read(size).replace(b"\x00", "\ufffd".encode())

    def readinto(self, buffer: bytearray) -> int:
        data = self.read(len(buffer))
        buffer[: len(data)] = data
        return len(data)

    def close(self) -> None:
        self.source.close()
        super().close()


def parse_timestamp(value: str) -> dt.datetime:
    normalized = value.strip().replace(" ", "T", 1)
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    try:
        timestamp = dt.datetime.fromisoformat(normalized)
    except ValueError as error:
        raise argparse.ArgumentTypeError("timestamp must be valid ISO 8601") from error

    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise argparse.ArgumentTypeError("timestamp must include a timezone")

    return timestamp.astimezone(dt.timezone.utc)


def format_timestamp(timestamp: dt.datetime) -> str:
    return timestamp.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_arguments(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)

    header = commands.add_parser("header")
    header.add_argument("--input", required=True, type=Path)

    load = commands.add_parser("load")
    load.add_argument("--input", required=True, action="append", type=Path)
    load.add_argument(
        "--source",
        required=True,
        choices=("discussion_dump", "minute_diff"),
    )
    load.add_argument("--as-of", required=True, type=parse_timestamp)
    load.add_argument("--sequence", type=int)
    load.add_argument("--only-ids", type=Path)
    load.add_argument("--stop-after-id", type=int)
    load.add_argument("--dry-run", action="store_true")

    return parser.parse_args(arguments)


def open_input(path: Path) -> BinaryIO:
    if path.suffix == ".bz2":
        source: BinaryIO = bz2.open(path, "rb")
    elif path.suffix == ".gz":
        source = gzip.open(path, "rb")
    else:
        source = path.open("rb")

    return io.BufferedReader(NulReplacingReader(source))


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def root_timestamp(path: Path) -> str:
    with open_input(path) as source:
        try:
            _, root = next(ET.iterparse(source, events=("start",)))
        except (ET.ParseError, StopIteration) as error:
            raise RuntimeError("input does not contain a valid XML root") from error

    if local_name(root.tag) != "osm":
        raise RuntimeError("input root must be osm")
    if "timestamp" not in root.attrib:
        raise RuntimeError("input root has no timestamp")

    try:
        timestamp = parse_timestamp(root.attrib["timestamp"])
    except argparse.ArgumentTypeError as error:
        raise RuntimeError("input root timestamp is invalid") from error

    return format_timestamp(timestamp)


def required_integer(attributes: dict[str, str], name: str) -> int:
    if name not in attributes:
        raise ValueError(f"missing {name}")
    try:
        value = int(attributes[name])
    except ValueError as error:
        raise ValueError(f"invalid {name}") from error
    if value < 0:
        raise ValueError(f"negative {name}")
    return value


def optional_integer(attributes: dict[str, str], name: str) -> int | None:
    if name not in attributes or attributes[name] == "":
        return None
    return required_integer(attributes, name)


def required_xml_timestamp(attributes: dict[str, str], name: str) -> str:
    if name not in attributes:
        raise ValueError(f"missing {name}")
    try:
        return format_timestamp(parse_timestamp(attributes[name]))
    except argparse.ArgumentTypeError as error:
        raise ValueError(f"invalid {name}") from error


def optional_xml_timestamp(attributes: dict[str, str], name: str) -> str | None:
    if name not in attributes or attributes[name] == "":
        return None
    return required_xml_timestamp(attributes, name)


def optional_boolean(attributes: dict[str, str], name: str) -> bool | None:
    if name not in attributes or attributes[name] == "":
        return None
    if attributes[name] == "true":
        return True
    if attributes[name] == "false":
        return False
    raise ValueError(f"invalid {name}")


def parse_bbox(attributes: dict[str, str]) -> tuple[float | None, ...]:
    names = ("min_lon", "min_lat", "max_lon", "max_lat")
    present = [name in attributes and attributes[name] != "" for name in names]
    if any(present) and not all(present):
        raise ValueError("partial bbox")
    if not any(present):
        return (None, None, None, None)

    try:
        min_lon, min_lat, max_lon, max_lat = (
            float(attributes[name]) for name in names
        )
    except ValueError as error:
        raise ValueError("invalid bbox") from error

    if not (-180 <= min_lon <= max_lon <= 180):
        raise ValueError("invalid longitude bounds")
    if not (-90 <= min_lat <= max_lat <= 90):
        raise ValueError("invalid latitude bounds")

    return min_lon, min_lat, max_lon, max_lat


def parse_discussion(changeset: ET.Element) -> list[dict[str, Any]]:
    discussion_elements = [
        child for child in changeset if local_name(child.tag) == "discussion"
    ]
    if len(discussion_elements) > 1:
        raise ValueError("multiple discussion elements")
    if not discussion_elements:
        return []

    discussion = discussion_elements[0]
    if any(local_name(child.tag) != "comment" for child in discussion):
        raise ValueError("invalid discussion child")

    comments: list[dict[str, Any]] = []
    for ordinal, comment in enumerate(discussion):
        text_elements = [child for child in comment if local_name(child.tag) == "text"]
        if len(text_elements) != 1 or len(comment) != 1:
            raise ValueError("invalid comment structure")

        comments.append(
            {
                "comment_id": optional_integer(comment.attrib, "id"),
                "ordinal": ordinal,
                "commented_at": required_xml_timestamp(comment.attrib, "date"),
                "osm_uid": optional_integer(comment.attrib, "uid"),
                "osm_user": comment.attrib.get("user") or None,
                "visible": optional_boolean(comment.attrib, "visible"),
                "body": (text_elements[0].text or "").replace("\x00", "\ufffd"),
            }
        )

    return comments


def parse_changeset(
    element: ET.Element,
    source: str,
    sequence: int | None,
    observed_at: str,
) -> list[Any]:
    attributes = element.attrib
    changeset_id = required_integer(attributes, "id")
    created_at = required_xml_timestamp(attributes, "created_at")
    open_value = optional_boolean(attributes, "open")
    if open_value is None:
        raise ValueError("missing open")
    closed_at = optional_xml_timestamp(attributes, "closed_at")
    if open_value and closed_at is not None:
        raise ValueError("open changeset has closed_at")
    if not open_value and closed_at is None:
        raise ValueError("closed changeset has no closed_at")

    min_lon, min_lat, max_lon, max_lat = parse_bbox(attributes)
    tags: dict[str, str] = {}
    for child in element:
        child_name = local_name(child.tag)
        if child_name == "tag":
            if "k" not in child.attrib or "v" not in child.attrib:
                raise ValueError("invalid tag")
            tags[child.attrib["k"].replace("\x00", "\ufffd")] = child.attrib[
                "v"
            ].replace("\x00", "\ufffd")
        elif child_name != "discussion":
            raise ValueError("invalid changeset child")

    discussion = parse_discussion(element)
    return [
        changeset_id,
        created_at,
        closed_at,
        open_value,
        optional_integer(attributes, "num_changes"),
        optional_integer(attributes, "comments_count"),
        optional_integer(attributes, "uid"),
        (attributes.get("user") or None),
        min_lon,
        min_lat,
        max_lon,
        max_lat,
        json.dumps(tags, ensure_ascii=False, separators=(",", ":")),
        source,
        sequence,
        observed_at,
        json.dumps(discussion, ensure_ascii=False, separators=(",", ":")),
    ]


def read_only_ids(path: Path | None) -> set[int] | None:
    if path is None:
        return None

    identifiers: set[int] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        value = line.strip()
        if not value:
            continue
        try:
            identifier = int(value)
        except ValueError as error:
            raise RuntimeError(f"only-ids line {line_number} is invalid") from error
        if identifier < 0:
            raise RuntimeError(f"only-ids line {line_number} is negative")
        identifiers.add(identifier)
    return identifiers


def iter_changesets(
    paths: Sequence[Path],
    source_name: str,
    sequence: int | None,
    observed_at: str,
    only_ids: set[int] | None,
    stop_after_id: int | None,
) -> Iterator[tuple[list[Any], bool]]:
    previous_id: int | None = None
    for path in paths:
        with open_input(path) as source:
            try:
                parser = ET.iterparse(source, events=("start", "end"))
                _, root = next(parser)
                if local_name(root.tag) != "osm":
                    raise RuntimeError("input root must be osm")

                for event, element in parser:
                    if event != "end" or local_name(element.tag) != "changeset":
                        continue
                    try:
                        changeset_id = required_integer(element.attrib, "id")
                    except (TypeError, ValueError) as error:
                        raise RuntimeError("invalid changeset XML") from error

                    if stop_after_id is not None:
                        if previous_id is not None and changeset_id < previous_id:
                            raise RuntimeError(
                                "stop-after-id requires nondecreasing changeset IDs"
                            )
                        if changeset_id > stop_after_id:
                            root.clear()
                            return
                    previous_id = changeset_id

                    selected = only_ids is None or changeset_id in only_ids
                    if not selected:
                        yield [changeset_id], False
                        element.clear()
                        root.clear()
                        continue

                    try:
                        row = parse_changeset(
                            element,
                            source_name,
                            sequence,
                            observed_at,
                        )
                    except (KeyError, TypeError, ValueError) as error:
                        raise RuntimeError("invalid changeset XML") from error

                    yield row, True
                    element.clear()
                    root.clear()
            except ET.ParseError as error:
                raise RuntimeError("malformed changeset XML") from error


def start_psql_copy(table: str) -> subprocess.Popen[str]:
    columns = ", ".join(STAGE_COLUMNS)
    command = (
        f"\\copy {table} ({columns}) FROM STDIN "
        "WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')"
    )
    return subprocess.Popen(
        ["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", command],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        text=True,
        env=os.environ.copy(),
    )


def load_changesets(arguments: argparse.Namespace) -> int:
    if arguments.sequence is not None and arguments.sequence < 0:
        raise RuntimeError("sequence must not be negative")
    if arguments.source == "minute_diff" and arguments.sequence is None:
        raise RuntimeError("minute_diff requires sequence")
    if arguments.stop_after_id is not None and arguments.stop_after_id < 0:
        raise RuntimeError("stop-after-id must not be negative")

    only_ids = read_only_ids(arguments.only_ids)
    observed_at = format_timestamp(arguments.as_of)
    table = (
        "osm_pipeline.changesets_dump_stage"
        if arguments.source == "discussion_dump"
        else "osm_pipeline.changesets_stage"
    )
    rows = iter_changesets(
        arguments.input,
        arguments.source,
        arguments.sequence,
        observed_at,
        only_ids,
        arguments.stop_after_id,
    )

    row_count = 0
    discussion_count = 0
    max_id_seen: int | None = None
    psql: subprocess.Popen[str] | None = None

    with ExitStack():
        if arguments.dry_run:
            writer = None
        else:
            subprocess.run(
                [
                    "psql",
                    "--no-psqlrc",
                    "--set=ON_ERROR_STOP=1",
                    "--command",
                    f"TRUNCATE {table}",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                env=os.environ.copy(),
            )
            psql = start_psql_copy(table)
            if psql.stdin is None:
                raise RuntimeError("unable to open PostgreSQL COPY input")
            writer = csv.writer(psql.stdin, delimiter="\t", lineterminator="\r\n")

        try:
            for row, selected in rows:
                max_id_seen = max(int(row[0]), max_id_seen or int(row[0]))
                if not selected:
                    continue
                row_count += 1
                discussion_count += len(json.loads(row[-1]))
                if writer is not None:
                    writer.writerow(["\\N" if value is None else value for value in row])
        except BaseException:
            if psql is not None:
                psql.terminate()
            raise
        finally:
            if psql is not None and psql.stdin is not None:
                psql.stdin.close()

    if psql is not None and psql.wait() != 0:
        raise RuntimeError("PostgreSQL COPY failed")

    print(
        f"changesets={row_count} discussion_comments={discussion_count} "
        f"max_id_seen={max_id_seen if max_id_seen is not None else 0}"
    )
    return 0


def main(arguments: Sequence[str] | None = None) -> int:
    parsed = parse_arguments(arguments)
    if parsed.command == "header":
        print(root_timestamp(parsed.input))
        return 0
    return load_changesets(parsed)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
