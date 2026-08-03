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

if [[ -z "${MAESTRO_EXPO_DEV_CLIENT_URL:-}" && "${MAESTRO_PLATFORM:-}" != "ios" ]]; then
  android_device_is_available=false

  if [[ "${MAESTRO_PLATFORM:-}" == "android" || -n "${MAESTRO_DEVICE:-}" ]]; then
    android_device_is_available=true
  elif command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | awk '$2 == "device" { found = 1 } END { exit !found }'; then
    android_device_is_available=true
  fi

  if [[ "$android_device_is_available" == true ]]; then
    export MAESTRO_EXPO_DEV_CLIENT_URL='exp+driversagainstflock://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
  fi
fi

cleanup() {
  if [[ "${MAESTRO_PLATFORM:-}" == "ios" ]]; then
    return
  fi

  "$SCRIPT_DIR/reset-android-location.sh" || true
}

android_app_id="${MAESTRO_APP_ID:-com.anonymous.drivefree.dev}"

force_stop_android_app() {
  if [[ "${MAESTRO_PLATFORM:-}" == "ios" ]] || ! command -v adb >/dev/null 2>&1; then
    return
  fi

  if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
    adb -s "$MAESTRO_DEVICE" shell am force-stop "$android_app_id" >/dev/null 2>&1 || true
  else
    adb shell am force-stop "$android_app_id" >/dev/null 2>&1 || true
  fi
}

run_maestro_flow() {
  local flow="$1"
  local maestro_args=()

  if [[ -n "${MAESTRO_PLATFORM:-}" ]]; then
    maestro_args+=(--platform "$MAESTRO_PLATFORM")
  fi

  if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
    maestro_args+=(--device "$MAESTRO_DEVICE")
  fi

  if [[ "${#maestro_args[@]}" -gt 0 ]]; then
    maestro "${maestro_args[@]}" test --debug-output "$maestro_debug_dir" "$flow" || return $?
  else
    maestro test --debug-output "$maestro_debug_dir" "$flow" || return $?
  fi
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
  force_stop_android_app

  flow_status=0
  run_maestro_flow "$flow" || flow_status=$?

  if [[ "$flow_status" -ne 0 && "${MAESTRO_PLATFORM:-android}" != "ios" ]]; then
    echo "Maestro flow failed; resetting Android app and retrying: $flow" >&2
    force_stop_android_app
    sleep 2
    flow_status=0
    run_maestro_flow "$flow" || flow_status=$?
  fi

  if [[ "$flow_status" -ne 0 ]]; then
    exit "$flow_status"
  fi
done
