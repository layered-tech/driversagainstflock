#!/usr/bin/env python3
"""Keep the terminal current-state version of relevant ALPR nodes."""

from __future__ import annotations

import argparse
from pathlib import Path

import osmium


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--tracked-ids", required=True)
    return parser.parse_args()


class CurrentChangeFilter(osmium.SimpleHandler):
    def __init__(self, writer: osmium.SimpleWriter, tracked_ids: set[int]) -> None:
        super().__init__()
        self.writer = writer
        self.tracked_ids = tracked_ids
        self.written = 0

    def node(self, node: osmium.osm.Node) -> None:
        is_exact_alpr = node.tags.get("surveillance:type") == "ALPR"
        if is_exact_alpr:
            self.tracked_ids.add(node.id)

        if node.id in self.tracked_ids:
            self.writer.add_node(node)
            self.written += 1


def main() -> int:
    arguments = parse_arguments()
    tracked_ids = {
        int(line)
        for line in Path(arguments.tracked_ids).read_text(encoding="utf-8").splitlines()
        if line
    }

    reader = osmium.MergeInputReader()
    reader.add_file(arguments.input)
    writer = osmium.SimpleWriter(arguments.output, overwrite=True)
    handler = CurrentChangeFilter(writer, tracked_ids)
    try:
        reader.apply(handler, simplify=True)
    finally:
        writer.close()

    print(handler.written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
