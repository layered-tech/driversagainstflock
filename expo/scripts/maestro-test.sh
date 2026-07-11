#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

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
    maestro "${maestro_args[@]}" test "$flow"
  else
    maestro test "$flow"
  fi
done
