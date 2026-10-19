#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo 'Usage: publish-corridor.sh OUTPUT_DIRECTORY BUCKET RELEASE_ID' >&2
    exit 1
fi
readonly OUTPUT="$1"
readonly BUCKET="$2"
readonly RELEASE_ID="$3"
readonly PREFIX="experimental/road-corridors/${RELEASE_ID}/wisconsin"
[[ "${RELEASE_ID}" =~ ^[0-9]{8}T[0-9]{6}Z-us-v[0-9]+$ ]] || exit 1
[[ "${BUCKET}" =~ ^[a-z0-9][a-z0-9.-]+$ ]] || exit 1
readonly MANIFEST="${OUTPUT}/manifest.json"
jq -e --arg release "${RELEASE_ID}" '
    .schema_version == 1 and .release_id == $release and .region == "wisconsin"
    and .record_count > 0 and (.tiles | length > 0)
    and ([.tiles[].key] | length == (unique | length))
    and all(.tiles[]; (.key | test("^tiles/-?[0-9]+_-?[0-9]+-[a-f0-9]{64}\\.jsonl\\.gz$"))
        and (.sha256 | test("^[a-f0-9]{64}$")) and .size_bytes > 0 and .record_count > 0)
' "${MANIFEST}" >/dev/null

# Validate everything locally before writing any object. The manifest is the
# commit marker. Content-addressed tiles keep concurrent/retried uploads from
# replacing the bytes referenced by another completed manifest.
while IFS=$'\t' read -r key checksum size; do
    [[ "$(sha256sum "${OUTPUT}/${key}" | awk '{print $1}')" == "${checksum}" ]] || exit 1
    [[ "$(wc -c < "${OUTPUT}/${key}" | tr -d ' ')" == "${size}" ]] || exit 1
    gzip -t "${OUTPUT}/${key}"
done < <(jq -r '.tiles[] | [.key, .sha256, .size_bytes] | @tsv' "${MANIFEST}")

existing="$(aws s3api list-objects-v2 --region us-east-1 --bucket "${BUCKET}" \
    --prefix "${PREFIX}/manifest.json" --query KeyCount --output text)"
[[ "${existing}" == 0 ]] || { echo 'Refusing to replace a published corridor release' >&2; exit 1; }
while IFS= read -r key; do
    aws s3 cp --region us-east-1 --no-progress "${OUTPUT}/${key}" "s3://${BUCKET}/${PREFIX}/${key}" \
        --content-type application/gzip
done < <(jq -r '.tiles[].key' "${MANIFEST}")
# Conditional commit prevents a completed manifest being overwritten by another run.
aws s3api put-object --region us-east-1 --bucket "${BUCKET}" --key "${PREFIX}/manifest.json" \
    --body "${MANIFEST}" --content-type application/json --if-none-match '*' >/dev/null
echo "CORRIDOR_PUBLISHED release=${RELEASE_ID} region=wisconsin"
