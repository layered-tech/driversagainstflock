#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
version="${1:-2.0}"
layout="${2:-portrait}"
dhu_root="${ANDROID_AUTO_DHU_ROOT:-$HOME/Library/Android/dhu}"

case "$version:$layout" in
    2.0:portrait) config="$EXPO_DIR/config/android-auto-dhu-portrait.ini" ;;
    2.1:portrait) config="$EXPO_DIR/config/android-auto-dhu-portrait-2.1.ini" ;;
    2.0:landscape) config="$EXPO_DIR/config/android-auto-dhu.ini" ;;
    2.1:landscape) config="$EXPO_DIR/config/android-auto-dhu-2.1.ini" ;;
    *) echo "Usage: $0 {2.0|2.1} {portrait|landscape} [--check]" >&2; exit 1 ;;
esac

binary="$dhu_root/$version/desktop-head-unit"
if [[ ! -x "$binary" ]]; then
    echo "DHU $version not found at $binary. Set ANDROID_AUTO_DHU_ROOT to your versioned installation directory." >&2
    exit 1
fi

version_output="$("$binary" --version 2>&1)"
if [[ "$version_output" != *"Version: $version-"* ]]; then
    echo "Expected DHU $version at $binary; got: $version_output" >&2
    exit 1
fi
printf '%s\nConfig: %s\n' "$version_output" "$config"

if [[ "${3:-}" == '--check' ]]; then
    exit 0
fi

adb forward tcp:5277 tcp:5277
exec "$binary" -c "$config"
