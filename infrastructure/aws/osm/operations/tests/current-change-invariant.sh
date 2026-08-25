#!/usr/bin/env bash
set -Eeuo pipefail

work_directory="$(mktemp --directory)"
trap 'rm -rf -- "${work_directory}"' EXIT

cat > "${work_directory}/change.osc" <<'OSM_CHANGE'
<?xml version="1.0" encoding="UTF-8"?>
<osmChange version="0.6" generator="daf-osm-current-test">
  <create>
    <node id="9" version="1" timestamp="2020-04-01T00:00:00Z" changeset="901" uid="91" user="tagger" visible="true" lat="40" lon="-100">
      <tag k="surveillance:type" v="ALPR" />
    </node>
  </create>
  <modify>
    <node id="9" version="2" timestamp="2020-04-02T00:00:00Z" changeset="902" uid="92" user="untagger" visible="true" lat="40" lon="-100" />
  </modify>
  <delete>
    <node id="9" version="3" timestamp="2020-04-03T00:00:00Z" changeset="903" uid="93" user="deleter" visible="false" />
  </delete>
  <create>
    <node id="10" version="1" timestamp="2020-04-01T00:00:00Z" changeset="904" uid="94" user="unrelated" visible="true" lat="40" lon="-100" />
    <way id="11" version="1" timestamp="2020-04-01T00:00:00Z" changeset="905" uid="95" user="way-editor" visible="true">
      <nd ref="10" />
      <tag k="highway" v="service" />
    </way>
  </create>
</osmChange>
OSM_CHANGE
: > "${work_directory}/tracked.txt"

python3 infrastructure/aws/osm/operations/bin/filter-current-change.py \
    --input "${work_directory}/change.osc" \
    --output "${work_directory}/filtered.osc.gz" \
    --tracked-ids "${work_directory}/tracked.txt" \
    > "${work_directory}/written-count.txt"

[[ "$(cat "${work_directory}/written-count.txt")" == 3 ]] \
    || { echo 'Expected all ALPR, untagged, and deleted node versions in the batch' >&2; exit 1; }
[[ "$(osmium fileinfo --extended --get=data.count.nodes "${work_directory}/filtered.osc.gz")" == 3 ]] \
    || { echo 'Filtered current change does not contain three node versions' >&2; exit 1; }
[[ "$(osmium fileinfo --extended --get=data.count.ways "${work_directory}/filtered.osc.gz")" == 0 ]] \
    || { echo 'Filtered current change unexpectedly retained a way' >&2; exit 1; }
[[ "$(osmium fileinfo --extended --get=data.count.relations "${work_directory}/filtered.osc.gz")" == 0 ]] \
    || { echo 'Filtered current change unexpectedly retained a relation' >&2; exit 1; }

echo 'Current ALPR-to-untagged-to-deleted batch invariant passed'
