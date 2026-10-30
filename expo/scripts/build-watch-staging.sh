#!/usr/bin/env bash
set -euo pipefail

expo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
watch_dir="$expo_dir/../wear-os"
artifacts_dir="$expo_dir/build-watch-phase1"
export APP_ENV=staging
export EXPO_NO_DOTENV=1
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ -z "${JAVA_HOME:-}" && -d '/Applications/Android Studio.app/Contents/jbr/Contents/Home' ]]; then
    export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
fi
cd "$expo_dir"
npx dotenv -c staging -- npx expo prebuild --platform android --no-install
npx dotenv -c staging -- ./android/gradlew -p android :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
"$watch_dir/gradlew" -p "$watch_dir" :app:assembleDebug --console=plain
mkdir -p "$artifacts_dir"
cp android/app/build/outputs/apk/release/app-release.apk "$artifacts_dir/daf-phone-staging-arm64.apk"
cp "$watch_dir/app/build/outputs/apk/debug/app-debug.apk" "$artifacts_dir/daf-watch-staging.apk"
# Both are local, development-signed staging APKs; never submit these to a store.
"$ANDROID_HOME/build-tools/37.0.0/apksigner" verify --print-certs "$artifacts_dir/daf-phone-staging-arm64.apk"
"$ANDROID_HOME/build-tools/37.0.0/apksigner" verify --print-certs "$artifacts_dir/daf-watch-staging.apk"
