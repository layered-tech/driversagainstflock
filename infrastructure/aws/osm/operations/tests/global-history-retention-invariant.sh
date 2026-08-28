#!/usr/bin/env bash
set -Eeuo pipefail

work_directory="$(mktemp --directory)"
trap 'rm -rf -- "${work_directory}"' EXIT

cat > "${work_directory}/history.osh" <<'OSM_HISTORY'
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="daf-osm-global-history-test">
  <node id="1" version="1" timestamp="2020-01-01T00:00:00Z" changeset="101" uid="11" user="before" visible="true" lat="0" lon="0" />
  <node id="1" version="2" timestamp="2020-01-02T00:00:00Z" changeset="102" uid="12" user="tagger" visible="true" lat="40" lon="-100">
    <tag k="surveillance:type" v="ALPR" />
  </node>
  <node id="1" version="3" timestamp="2020-01-03T00:00:00Z" changeset="103" uid="13" user="after" visible="true" lat="0" lon="10" />
  <node id="2" version="1" timestamp="2020-02-01T00:00:00Z" changeset="201" uid="21" user="global-tagger" visible="true" lat="-40" lon="120">
    <tag k="surveillance:type" v="ALPR" />
  </node>
  <node id="2" version="2" timestamp="2020-02-02T00:00:00Z" changeset="202" uid="22" user="global-deleter" visible="false" />
  <node id="3" version="1" timestamp="2020-03-01T00:00:00Z" changeset="301" uid="31" user="unrelated" visible="true" lat="10" lon="20" />
</osm>
OSM_HISTORY

osmium tags-filter \
    --omit-referenced \
    --output "${work_directory}/matching.osh.pbf" \
    "${work_directory}/history.osh" \
    'n/surveillance:type=ALPR'
osmium getid \
    --with-history \
    --id-osm-file "${work_directory}/matching.osh.pbf" \
    --output-format=opl \
    --output "${work_directory}/retained.opl" \
    "${work_directory}/history.osh"

[[ "$(awk '$1 == "n1" { count++ } END { print count + 0 }' "${work_directory}/retained.opl")" == 3 ]] \
    || { echo 'Global history did not retain every version of node 1' >&2; exit 1; }
[[ "$(awk '$1 == "n2" { count++ } END { print count + 0 }' "${work_directory}/retained.opl")" == 2 ]] \
    || { echo 'Global history did not retain every version of node 2' >&2; exit 1; }
[[ "$(awk '$1 == "n3" { count++ } END { print count + 0 }' "${work_directory}/retained.opl")" == 0 ]] \
    || { echo 'Global history retained an unqualified node' >&2; exit 1; }

echo 'Global exact-tag qualification and all-version retention invariant passed'
