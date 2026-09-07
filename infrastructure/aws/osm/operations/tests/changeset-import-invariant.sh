#!/usr/bin/env bash

set -Eeuo pipefail

readonly TEST_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly IMPORTER="${TEST_DIRECTORY}/../bin/import-changesets.py"
readonly FIXTURES="${TEST_DIRECTORY}/fixtures/changesets"

work_directory="$(mktemp -d)"
trap 'rm -rf -- "${work_directory}"' EXIT

gzip --stdout "${FIXTURES}/ordered.osm" > "${work_directory}/ordered.osm.gz"
bzip2 --stdout "${FIXTURES}/ordered.osm" > "${work_directory}/ordered.osm.bz2"

header="$(python3 "${IMPORTER}" header --input "${work_directory}/ordered.osm.bz2")"
[[ "${header}" == '2026-08-30T23:59:56Z' ]]

dry_run_output="$(python3 "${IMPORTER}" load \
    --input "${FIXTURES}/ordered.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --dry-run)"
[[ "${dry_run_output}" == 'changesets=3 discussion_comments=3 max_id_seen=12' ]]
[[ "${dry_run_output}" != *'fixture-sensitive'* ]]
[[ "${dry_run_output}" != *'snowman'* ]]

perl -0pe 's/(<comment) id="[0-9]+"/$1/g' \
    "${FIXTURES}/ordered.osm" > "${work_directory}/ordered-without-comment-ids.osm"
no_comment_id_output="$(python3 "${IMPORTER}" load \
    --input "${work_directory}/ordered-without-comment-ids.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --dry-run)"
[[ "${no_comment_id_output}" == 'changesets=3 discussion_comments=3 max_id_seen=12' ]]

printf '11\n' > "${work_directory}/only-ids"
perl -0pe 's/min_lon="-91" min_lat="30" max_lon="-90"/min_lon="269" min_lat="30" max_lon="270"/' \
    "${FIXTURES}/ordered.osm" > "${work_directory}/invalid-untracked-bbox.osm"
scoped_validation_output="$(python3 "${IMPORTER}" load \
    --input "${work_directory}/invalid-untracked-bbox.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --only-ids "${work_directory}/only-ids" \
    --dry-run)"
[[ "${scoped_validation_output}" == 'changesets=1 discussion_comments=2 max_id_seen=12' ]]

filtered_output="$(python3 "${IMPORTER}" load \
    --input "${work_directory}/ordered.osm.gz" \
    --input "${work_directory}/ordered.osm.gz" \
    --source minute_diff \
    --sequence 7172790 \
    --as-of 2026-09-06T03:46:39.015309Z \
    --only-ids "${work_directory}/only-ids" \
    --dry-run)"
[[ "${filtered_output}" == 'changesets=2 discussion_comments=4 max_id_seen=12' ]]

stopped_output="$(python3 "${IMPORTER}" load \
    --input "${FIXTURES}/ordered.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --stop-after-id 11 \
    --dry-run)"
[[ "${stopped_output}" == 'changesets=2 discussion_comments=2 max_id_seen=11' ]]

if python3 "${IMPORTER}" load \
    --input "${FIXTURES}/partial-bbox.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --dry-run >"${work_directory}/partial.out" 2>"${work_directory}/partial.err"; then
    echo 'Partial bbox fixture unexpectedly succeeded' >&2
    exit 1
fi
if rg --quiet 'fixture-sensitive|fixture-user|fixture-commenter' \
    "${work_directory}/partial.out" "${work_directory}/partial.err"; then
    echo 'Importer error output exposed sensitive XML content' >&2
    exit 1
fi

if python3 "${IMPORTER}" load \
    --input "${FIXTURES}/unordered.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --stop-after-id 30 \
    --dry-run >/dev/null 2>&1; then
    echo 'Unordered stop-after fixture unexpectedly succeeded' >&2
    exit 1
fi

mkdir "${work_directory}/fake-bin"
cat > "${work_directory}/fake-bin/psql" <<'FAKE_PSQL'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *'TRUNCATE osm_pipeline.'* ]]; then
    echo 'TRUNCATE TABLE'
elif [[ "$*" == *'copy osm_pipeline.'* ]]; then
    cp /dev/stdin "${FAKE_COPY_OUTPUT}"
    echo 'COPY 3'
fi
FAKE_PSQL
chmod +x "${work_directory}/fake-bin/psql"

copy_output="$(
    PATH="${work_directory}/fake-bin:${PATH}" \
    FAKE_COPY_OUTPUT="${work_directory}/copy.tsv" \
    python3 "${IMPORTER}" load \
        --input "${FIXTURES}/ordered.osm" \
        --source minute_diff \
        --sequence 7172790 \
        --as-of 2026-09-06T03:46:39.015309Z
)"
if [[ "${copy_output}" != 'changesets=3 discussion_comments=3 max_id_seen=12' ]]; then
    echo 'Importer output included unexpected PostgreSQL status output' >&2
    exit 1
fi
[[ "$(wc -l < "${work_directory}/copy.tsv" | tr -d ' ')" == 3 ]]
rg --quiet 'first & second' "${work_directory}/copy.tsv"
rg --quiet 'Unicode snowman: ☃' "${work_directory}/copy.tsv"
rg --quiet 'ordinal.*1' "${work_directory}/copy.tsv"

cp "${FIXTURES}/ordered.osm" "${work_directory}/nul.osm"
perl -0pi -e 's/Unicode/Unicode\x00/' "${work_directory}/nul.osm"
nul_output="$(python3 "${IMPORTER}" load \
    --input "${work_directory}/nul.osm" \
    --source discussion_dump \
    --as-of 2026-08-30T23:59:56Z \
    --dry-run)"
[[ "${nul_output}" == 'changesets=3 discussion_comments=3 max_id_seen=12' ]]

echo 'changeset-import-invariant: PASS'
