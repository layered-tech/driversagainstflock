#!/usr/bin/env python3
"""Stream node history from an OSM file into the PostgreSQL history staging table."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from typing import TextIO
from urllib.parse import unquote


COLUMNS = (
    "node_id",
    "osm_version",
    "visible",
    "longitude",
    "latitude",
    "tags",
    "osm_updated_at",
    "changeset_id",
    "osm_uid",
    "osm_user",
    "source",
    "replication_sequence",
)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument(
        "--source",
        required=True,
        choices=("full_history", "minute_diff", "api_backfill"),
    )
    parser.add_argument("--sequence", type=int)
    return parser.parse_args()


def decode_opl(value: str) -> str:
    return unquote(value, encoding="utf-8", errors="strict")


def parse_tags(encoded_tags: str) -> dict[str, str]:
    if not encoded_tags:
        return {}

    tags: dict[str, str] = {}
    for encoded_pair in encoded_tags.split(","):
        encoded_key, separator, encoded_value = encoded_pair.partition("=")
        if not separator:
            raise ValueError(f"Malformed OPL tag: {encoded_pair}")
        tags[decode_opl(encoded_key)] = decode_opl(encoded_value)
    return tags


def parse_node(line: str, source: str, sequence: int | None) -> list[object] | None:
    fields = line.rstrip("\n").split(" ")
    if not fields or not fields[0].startswith("n"):
        return None

    values: dict[str, str] = {}
    for field in fields[1:]:
        if field:
            values[field[0]] = field[1:]

    visible = values.get("d", "V") == "V"
    longitude = values.get("x") or None
    latitude = values.get("y") or None
    uid = values.get("i") or None
    user = decode_opl(values["u"]) if values.get("u") else None

    return [
        int(fields[0][1:]),
        int(values["v"]),
        visible,
        longitude,
        latitude,
        json.dumps(parse_tags(values.get("T", "")), separators=(",", ":"), ensure_ascii=False),
        values["t"],
        int(values["c"]),
        int(uid) if uid is not None else None,
        user,
        source,
        sequence,
    ]


def start_psql_copy() -> subprocess.Popen[str]:
    column_list = ", ".join(COLUMNS)
    copy_command = (
        "\\copy osm_pipeline.node_versions_stage "
        f"({column_list}) FROM STDIN "
        "WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')"
    )
    return subprocess.Popen(
        ["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", copy_command],
        stdin=subprocess.PIPE,
        text=True,
        env=os.environ.copy(),
    )


def stream_rows(osmium_stdout: TextIO, psql_stdin: TextIO, source: str, sequence: int | None) -> int:
    writer = csv.writer(psql_stdin, delimiter="\t", lineterminator="\n")
    row_count = 0

    for line_number, line in enumerate(osmium_stdout, start=1):
        try:
            row = parse_node(line, source, sequence)
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError(f"Invalid OPL node at line {line_number}: {error}") from error

        if row is not None:
            writer.writerow(["\\N" if value is None else value for value in row])
            row_count += 1

    return row_count


def main() -> int:
    arguments = parse_arguments()

    subprocess.run(
        ["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", "TRUNCATE osm_pipeline.node_versions_stage"],
        check=True,
        env=os.environ.copy(),
    )

    osmium = subprocess.Popen(
        ["osmium", "cat", arguments.input, "--output-format=opl"],
        stdout=subprocess.PIPE,
        text=True,
    )
    psql = start_psql_copy()

    if osmium.stdout is None or psql.stdin is None:
        raise RuntimeError("Unable to open importer pipeline")

    try:
        row_count = stream_rows(
            osmium.stdout,
            psql.stdin,
            arguments.source,
            arguments.sequence,
        )
    finally:
        osmium.stdout.close()
        psql.stdin.close()

    osmium_status = osmium.wait()
    psql_status = psql.wait()

    if osmium_status != 0:
        raise RuntimeError(f"osmium exited with status {osmium_status}")
    if psql_status != 0:
        raise RuntimeError(f"psql COPY exited with status {psql_status}")
    if row_count == 0:
        raise RuntimeError("History input contained no node versions")

    print(f"Imported {row_count} node versions into staging", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
