#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/external-build-storage.sh"

build_root="${DAF_EAS_LOCAL_BUILD_ROOT:-/Volumes/PfeiferDev/DevCaches/chris/expo-builds}"
maestro_artifacts_dir="$build_root/maestro"
maestro_debug_dir="$maestro_artifacts_dir/debug"
maestro_screenshot_dir="$maestro_artifacts_dir/screenshots"
maestro_tmp_dir="$build_root/tmp"

require_external_build_root "$build_root"
mkdir -p "$maestro_debug_dir" "$maestro_screenshot_dir" "$maestro_tmp_dir"

if [[ ! -w "$build_root" ]]; then
  echo "Maestro test storage is not writable: $build_root" >&2
  exit 1
fi

export MAESTRO_ARTIFACTS_DIR="$maestro_screenshot_dir"
export MAESTRO_DEBUG_DIR="$maestro_debug_dir"
export MAESTRO_METRO_LOG_DIR="$maestro_artifacts_dir"
export TMPDIR="$maestro_tmp_dir"

cd "$SCRIPT_DIR/.."
exec node "$SCRIPT_DIR/maestro-test.mjs" "$@"
