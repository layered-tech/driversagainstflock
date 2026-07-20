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
export TMPDIR="$maestro_tmp_dir"

cleanup() {
  if [[ "${MAESTRO_PLATFORM:-}" == "ios" ]]; then
    return
  fi

  "$SCRIPT_DIR/reset-android-location.sh" || true
}

cleanup
trap cleanup EXIT

flows=()

for target in "$@"; do
  if [[ -d "$target" ]]; then
    while IFS= read -r -d '' flow; do
      flows+=("$flow")
    done < <(find "$target" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print0 | sort -z)
  else
    flows+=("$target")
  fi
done

if [[ "${#flows[@]}" -eq 0 ]]; then
  echo "No Maestro flows found." >&2
  exit 1
fi

for flow in "${flows[@]}"; do
  cleanup
  maestro_args=()

  if [[ -n "${MAESTRO_PLATFORM:-}" ]]; then
    maestro_args+=(--platform "$MAESTRO_PLATFORM")
  fi

  if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
    maestro_args+=(--device "$MAESTRO_DEVICE")
  fi

  if [[ "${#maestro_args[@]}" -gt 0 ]]; then
    maestro "${maestro_args[@]}" test --debug-output "$maestro_debug_dir" "$flow"
  else
    maestro test --debug-output "$maestro_debug_dir" "$flow"
  fi
done
