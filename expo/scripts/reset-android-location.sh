#!/usr/bin/env bash
set -euo pipefail

RESET_LATITUDE="${ANDROID_E2E_RESET_LATITUDE:-37.422}"
RESET_LONGITUDE="${ANDROID_E2E_RESET_LONGITUDE:--122.084}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found; skipped Android location reset." >&2
  exit 0
fi

serial="${ANDROID_SERIAL:-}"
if [[ -z "$serial" ]]; then
  serial="$(adb devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
fi

if [[ -z "$serial" ]]; then
  echo "No running Android emulator; skipped Android location reset." >&2
  exit 0
fi

adb_device=(adb -s "$serial")

# Maestro setLocation leaves gps as a mock provider. Remove it, then publish a
# normal emulator GPS fix so fused/passive providers stop returning stale mocks.
"${adb_device[@]}" shell appops set 2000 android:mock_location allow >/dev/null 2>&1 || true
"${adb_device[@]}" shell cmd location providers remove-test-provider gps >/dev/null 2>&1 || true
"${adb_device[@]}" emu geo fix "$RESET_LONGITUDE" "$RESET_LATITUDE" >/dev/null
"${adb_device[@]}" shell appops set 2000 android:mock_location default >/dev/null 2>&1 || true
