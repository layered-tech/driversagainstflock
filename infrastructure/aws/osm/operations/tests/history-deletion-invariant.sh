#!/usr/bin/env bash
set -Eeuo pipefail

work_directory="$(mktemp --directory)"
trap 'rm -rf -- "${work_directory}"' EXIT

cat > "${work_directory}/history.osh" <<'OSM_HISTORY'
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="daf-osm-deletion-test">
  <node id="7" version="1" timestamp="2020-03-01T00:00:00Z" changeset="701" uid="71" user="creator" visible="true" lat="40" lon="-100">
    <tag k="surveillance:type" v="ALPR" />
  </node>
  <node id="7" version="2" timestamp="2020-03-02T00:00:00Z" changeset="702" uid="72" user="deleter" visible="false" />
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

deleted_line="$(grep '^n7 v2 ' "${work_directory}/retained.opl")"
[[ -n "${deleted_line}" ]] || { echo 'Deleted version 2 was not retained' >&2; exit 1; }
[[ "${deleted_line}" == *' dD '* ]] || { echo 'Deleted version visibility was not retained' >&2; exit 1; }
[[ "${deleted_line}" == *' c702 '* ]] || { echo 'Deleted version changeset was not retained' >&2; exit 1; }
[[ "${deleted_line}" == *' i72 '* ]] || { echo 'Deleted version uid was not retained' >&2; exit 1; }
[[ "${deleted_line}" == *' udeleter '* ]] || { echo 'Deleted version username was not retained' >&2; exit 1; }

longitude_token="$(awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^x/) print $i }' <<< "${deleted_line}")"
latitude_token="$(awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^y/) print $i }' <<< "${deleted_line}")"
[[ "${longitude_token}" == x && "${latitude_token}" == y ]] \
    || { echo 'Deleted version unexpectedly retained coordinates' >&2; exit 1; }

echo 'Deleted lifecycle version metadata and visibility invariant passed'
