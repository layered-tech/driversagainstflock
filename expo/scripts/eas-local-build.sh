#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/external-build-storage.sh"

build_root="${DAF_EAS_LOCAL_BUILD_ROOT:-/Volumes/PfeiferDev/DevCaches/chris/expo-builds}"
work_parent="$build_root/eas-work"
artifacts_dir="$build_root/eas-artifacts"
tmp_dir="$build_root/tmp"

reject_internal_temp_arguments "$@"
require_external_build_root "$build_root"

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
