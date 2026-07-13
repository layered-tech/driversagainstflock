#!/usr/bin/env bash
set -euo pipefail

build_root="${DAF_EAS_LOCAL_BUILD_ROOT:-/Volumes/PfeiferDev/DevCaches/chris/expo-builds}"
work_parent="$build_root/eas-work"
artifacts_dir="$build_root/eas-artifacts"
tmp_dir="$build_root/tmp"

if [[ -z "${DAF_EAS_LOCAL_BUILD_ROOT:-}" ]] && ! mount | grep -F ' on /Volumes/PfeiferDev ' >/dev/null; then
  echo 'PfeiferDev must be mounted for local EAS builds.' >&2
  exit 1
fi

mkdir -p "$work_parent" "$artifacts_dir" "$tmp_dir"

if [[ ! -w "$build_root" ]]; then
  echo "Local EAS build storage is not writable: $build_root" >&2
  exit 1
fi

working_dir="$(mktemp -d "$work_parent/eas.XXXXXX")"

export TMPDIR="$tmp_dir"
export EAS_LOCAL_BUILD_WORKINGDIR="$working_dir"
export EAS_LOCAL_BUILD_ARTIFACTS_DIR="$artifacts_dir"

exec eas build --local "$@"
