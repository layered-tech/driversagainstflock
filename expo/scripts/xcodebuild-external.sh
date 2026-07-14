#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/external-build-storage.sh"

build_root="${DAF_EAS_LOCAL_BUILD_ROOT:-/Volumes/PfeiferDev/DevCaches/chris/expo-builds}"
derived_data_dir="$build_root/xcode-derived/driversagainstflock"
tmp_dir="$build_root/tmp"

for argument in "$@"; do
    if [[ "$argument" == "-derivedDataPath" || "$argument" == -derivedDataPath=* ]]; then
        echo 'The external Xcode wrapper controls -derivedDataPath.' >&2
        exit 1
    fi
done

reject_internal_temp_arguments "$@"
require_external_build_root "$build_root"

mkdir -p "$derived_data_dir" "$tmp_dir"

if [[ ! -w "$build_root" ]]; then
    echo "Xcode build storage is not writable: $build_root" >&2
    exit 1
fi

export TMPDIR="$tmp_dir"

exec xcodebuild -derivedDataPath "$derived_data_dir" "$@"
