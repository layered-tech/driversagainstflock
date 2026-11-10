#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'HELP'
Usage: bash scripts/build-wear.sh staging|production

staging    Build a watch AAB, signed like the EAS staging phone.
production Build a signed Android App Bundle for the existing app's Wear OS Play track.

Prerequisites: JDK 17+, Android SDK platform 37, and the SDK's accepted licenses.
ANDROID_HOME (or ANDROID_SDK_ROOT) and JAVA_HOME override local discovery.

Staging uses the phone's EAS signing credentials from expo/credentials.json.
The phone and watch must have the same application ID and signing certificate.

The npm staging and production commands load the phone's EAS credentials from
expo/credentials.json automatically. Download them once with eas credentials
(Android > production > credentials.json > Download credentials from EAS).
The credentials file and keystore are ignored by Git.

Both npm commands read the phone's EAS Android version counter, reserve the next
code in EAS, and save it in wear-os/version-code.json before Gradle starts.
Failed builds retain their reserved code. Keep phone and watch builds sequential;
EAS version read/write operations are not an atomic allocation across machines.
Log in with eas login or set EXPO_TOKEN. EAS failures stop the build.
Use --check-version on either npm command to preview without reserving or building.
WEAR_VERSION_CODE can override the next code with a value above both counters.
To override local credentials, supply
all four WEAR_RELEASE_* variables below together. Direct invocation of this
shell script also requires these exported environment variables:
  WEAR_VERSION_CODE            Unused Play code across phone AND watch (1..2100000000).
  WEAR_RELEASE_STORE_FILE      Absolute path to the existing Play upload keystore.
  WEAR_RELEASE_STORE_PASSWORD  Keystore password.
  WEAR_RELEASE_KEY_ALIAS       Upload key alias (not androiddebugkey).
  WEAR_RELEASE_KEY_PASSWORD    Upload key password.
Optional: WEAR_VERSION_NAME (default 0.1.0), WEAR_OUTPUT_DIR.

Use the existing phone app's Play listing and app signing key. The upload key
signs the AAB; Google Play signs installed APKs. A locally debug-signed phone
cannot communicate with a Play-signed watch.

Outputs: wear-os/build/artifacts/daf-watch-staging.aab or daf-watch-production.aab.
These commands do not build the phone, install apps, or upload to Google Play.
HELP
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then usage; exit 0; fi
if [[ "$#" != 1 || ( "$1" != staging && "$1" != production ) ]]; then usage >&2; exit 1; fi

expo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
watch_dir="$(cd -- "$expo_dir/../wear-os" && pwd)"
profile="$1"
artifacts_dir="${WEAR_OUTPUT_DIR:-$watch_dir/build/artifacts}"

if [[ -n "${WEAR_VERSION_CODE:-}" ]] && ! [[ "$WEAR_VERSION_CODE" =~ ^[1-9][0-9]{0,9}$ && "$WEAR_VERSION_CODE" -le 2100000000 ]]; then
    echo 'WEAR_VERSION_CODE must be an integer between 1 and 2100000000.' >&2
    exit 1
fi
for variable in WEAR_VERSION_CODE WEAR_RELEASE_STORE_FILE WEAR_RELEASE_STORE_PASSWORD WEAR_RELEASE_KEY_ALIAS WEAR_RELEASE_KEY_PASSWORD; do
    if [[ -z "${!variable:-}" ]]; then echo "Set $variable before building a Play bundle." >&2; exit 1; fi
done
if [[ "$WEAR_RELEASE_STORE_FILE" != /* || ! -f "$WEAR_RELEASE_STORE_FILE" ]]; then
    echo 'WEAR_RELEASE_STORE_FILE must be an absolute path to an existing upload keystore.' >&2; exit 1
fi
if [[ "$WEAR_RELEASE_KEY_ALIAS" == androiddebugkey ]]; then
    echo 'Play bundles must use your upload key, not the Android debug key.' >&2; exit 1
fi
export WEAR_BUILD_ENV="$profile"
task=':app:bundleRelease'
source_artifact="$watch_dir/app/build/outputs/bundle/release/app-release.aab"
output_artifact="$artifacts_dir/daf-watch-$profile.aab"

if [[ -z "${JAVA_HOME:-}" && -d '/Applications/Android Studio.app/Contents/jbr/Contents/Home' ]]; then
    export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
fi
if [[ -z "${ANDROID_HOME:-}" ]]; then
    if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
        export ANDROID_HOME="$ANDROID_SDK_ROOT"
    elif [[ -d "$HOME/Library/Android/sdk" ]]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [[ -d "$HOME/Android/Sdk" ]]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
    fi
fi

"$watch_dir/gradlew" -p "$watch_dir" "$task" --console=plain
mkdir -p "$artifacts_dir"
cp "$source_artifact" "$output_artifact"
printf 'Wear OS %s artifact: %s\n' "$profile" "$output_artifact"
