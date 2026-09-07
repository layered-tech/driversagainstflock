#!/usr/bin/env python3
"""Exercise the actual shell query invocations against the fixture PostgreSQL."""

from pathlib import Path
import subprocess


bin_directory = Path(__file__).resolve().parent.parent / "bin"


def section(filename: str, start: str, end: str) -> str:
    source = (bin_directory / filename).read_text()
    return source.split(start, 1)[1].split(end, 1)[0]


def run(script: str) -> str:
    return subprocess.run(
        ["bash", "-c", 'set -Eeuo pipefail\npsql_osm() { psql -X -v ON_ERROR_STOP=1 "$@"; }\n' + script],
        text=True, capture_output=True, check=True,
    ).stdout.strip()


run("""psql_osm <<'SQL'
ALTER TABLE osm_current.alpr_nodes ADD COLUMN osm_updated_at timestamptz;
INSERT INTO osm_current.alpr_nodes (node_id, changeset_id, osm_updated_at)
VALUES (9001, 9001, '2026-08-01'), (9002, 9002, '2026-10-01');
INSERT INTO osm_pipeline.state (state_key, state_value) VALUES ('probe''quote', 'present');
SQL
""")

core = "bootstrap-changesets-core.sh"
query = 'missing_count="$(psql_osm' + section(core, 'missing_count="$(psql_osm', '[[ "${missing_count}"')
assert run('dump_timestamp=2026-09-01T00:00:00Z\n' + query + '\nprintf "%s" "$missing_count"') == "1"

query = 'is_newer="$(psql_osm' + section(core, 'is_newer="$(psql_osm', '    [[ "${is_newer}"')
for timestamp, expected in [("2026-09-02T00:00:00Z", "1"), ("2026-08-01T00:00:00Z", "0")]:
    assert run(f'dump_timestamp={timestamp}\nprevious_dump_timestamp=2026-09-01T00:00:00Z\n' + query + '\nprintf "%s" "$is_newer"') == expected

query = 'psql_osm --tuples-only --no-align --set=dump_max_id=' + section(
    "changeset-backfill.sh", 'psql_osm --tuples-only --no-align --set=dump_max_id=', 'if [[ ! -s "${missing_ids}"')
assert run('dump_max_id=9001\nmissing_ids=$(mktemp)\ntrap \'rm -f "$missing_ids"\' EXIT\n' + query + '\ncat "$missing_ids"') == "9001"

query = 'state_entry="$(psql_osm' + section("refresh-changesets.sh", 'state_entry="$(psql_osm', '    [[ -n "${state_entry}"')
assert run('required_state_key="probe\'quote"\n' + query + '\nprintf "%s" "$state_entry"') == "present"

query = '[[ -n "$(psql_osm' + section("validate-core.sh", '[[ -n "$(psql_osm', '\n    done')
run('required_state_key="probe\'quote"\ndie() { exit 1; }\n' + query)

run("psql_osm --command=\"DELETE FROM osm_current.alpr_nodes; DELETE FROM osm_pipeline.state;\"")
print("changeset-query-invocation: PASS")
