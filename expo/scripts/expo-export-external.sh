#!/usr/bin/env bash
set -euo pipefail

build_root="${DAF_EAS_LOCAL_BUILD_ROOT:-/Volumes/PfeiferDev/DevCaches/chris/expo-builds}"
exports_dir="$build_root/expo-exports"
tmp_dir="$build_root/tmp"

if [[ -z "${DAF_EAS_LOCAL_BUILD_ROOT:-}" ]] && ! mount | grep -F ' on /Volumes/PfeiferDev ' >/dev/null; then
  echo 'PfeiferDev must be mounted for Expo exports.' >&2
  exit 1
fi

mkdir -p "$exports_dir" "$tmp_dir"

if [[ ! -w "$build_root" ]]; then
  echo "Expo export storage is not writable: $build_root" >&2
  exit 1
fi

output_dir="$exports_dir/$(date '+%Y%m%d-%H%M%S')-$$"

export TMPDIR="$tmp_dir"

exec npx expo export --output-dir "$output_dir" "$@"
