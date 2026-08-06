#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/external-build-storage.sh"

build_root="${DAF_EAS_LOCAL_BUILD_ROOT:-/Volumes/PfeiferDev/DevCaches/chris/expo-builds}"
artifacts_root="$build_root/android-auto-e2e"
tmp_dir="$build_root/tmp"
suite="${1:-$EXPO_DIR/.android-auto/suite.json}"

require_external_build_root "$build_root"
mkdir -p "$artifacts_root" "$tmp_dir"

for writable_directory in "$artifacts_root" "$tmp_dir"; do
    if [[ ! -w "$writable_directory" ]]; then
        echo "Android Auto test storage is not writable: $writable_directory" >&2
        exit 1
    fi
done

export ANDROID_AUTO_E2E_ARTIFACTS_DIR="$artifacts_root"
export TMPDIR="$tmp_dir"
exec node "$SCRIPT_DIR/android-auto-e2e.mjs" "$suite"
