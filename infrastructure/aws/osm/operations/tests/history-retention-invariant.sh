#!/usr/bin/env bash
set -Eeuo pipefail

work_directory="$(mktemp --directory)"
trap 'rm -rf -- "${work_directory}"' EXIT

cat > "${work_directory}/history.osh" <<'OSM_HISTORY'
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="daf-osm-invariant-test">
  <node id="1" version="1" timestamp="2020-01-01T00:00:00Z" changeset="101" uid="11" user="outside-before" visible="true" lat="0" lon="0" />
  <node id="1" version="2" timestamp="2020-01-02T00:00:00Z" changeset="102" uid="12" user="inside-alpr" visible="true" lat="40" lon="-100">
    <tag k="surveillance:type" v="ALPR" />
  </node>
  <node id="1" version="3" timestamp="2020-01-03T00:00:00Z" changeset="103" uid="13" user="outside-after" visible="true" lat="0" lon="10" />
  <node id="2" version="1" timestamp="2020-02-01T00:00:00Z" changeset="201" uid="21" user="inside-untagged" visible="true" lat="40" lon="-100" />
  <node id="2" version="2" timestamp="2020-02-02T00:00:00Z" changeset="202" uid="22" user="outside-alpr" visible="true" lat="0" lon="20">
    <tag k="surveillance:type" v="ALPR" />
  </node>
</osm>
OSM_HISTORY

cat > "${work_directory}/north-america.poly" <<'OSM_POLYGON'
north-america-test
1
  -110 30
  -90 30
  -90 50
  -110 50
  -110 30
END
END
OSM_POLYGON

osmium tags-filter \
    --omit-referenced \
    --output "${work_directory}/matching.osh.pbf" \
    "${work_directory}/history.osh" \
    'n/surveillance:type=ALPR'
osmium extract \
    --with-history \
    --option=relations=false \
    --polygon "${work_directory}/north-america.poly" \
    --output "${work_directory}/qualifying.osh.pbf" \
    "${work_directory}/matching.osh.pbf"
osmium getid \
    --with-history \
    --id-osm-file "${work_directory}/qualifying.osh.pbf" \
    --output "${work_directory}/retained.osh.pbf" \
    "${work_directory}/history.osh"

osmium cat --output-format=opl "${work_directory}/retained.osh.pbf" \
    > "${work_directory}/retained.opl"

retained_node_one_versions="$(awk '$1 == "n1" { count++ } END { print count + 0 }' "${work_directory}/retained.opl")"
retained_node_two_versions="$(awk '$1 == "n2" { count++ } END { print count + 0 }' "${work_directory}/retained.opl")"

[[ "${retained_node_one_versions}" == 3 ]] \
    || { echo "Expected all three lifecycle versions for qualifying node 1" >&2; exit 1; }
[[ "${retained_node_two_versions}" == 0 ]] \
    || { echo "Node 2 must not qualify from an untagged version inside the region" >&2; exit 1; }

for contributor in outside-before inside-alpr outside-after; do
    grep --fixed-strings --quiet "u${contributor}" "${work_directory}/retained.opl" \
        || { echo "Missing retained contributor ${contributor}" >&2; exit 1; }
done

echo 'History qualification and all-version retention invariant passed'
