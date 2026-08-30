# Android Auto end-to-end tests

This harness exercises the installed Android development build through the Android Auto Desktop Head Unit (DHU). It drives the DHU over stdin, checks native car-app screens with macOS Vision OCR, watches Metro markers, and verifies Android service and wake-lock state.

## Prerequisites

- macOS with Xcode command-line tools (`xcrun`, `swiftc`) so the Vision OCR helper can be compiled.
- The Android SDK and `adb`, plus the Android Auto DHU. The default DHU path is `$ANDROID_HOME/extras/google/auto/desktop-head-unit`.
- Android Auto developer mode enabled on the emulator, with the **Start head unit server** control available.
- Exactly one running Android emulator, unless `ANDROID_AUTO_E2E_DEVICE` or `ANDROID_SERIAL` selects one explicitly.
- A compatible development build installed. The default suite expects `com.anonymous.drivefree.dev` and its `AndroidAutoService`.
- `expo/.env.development.local` copied from the primary checkout and containing a non-empty `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`. The runner checks the key without logging its value; do not commit the file.
- A writable external build root under a mounted `/Volumes/...` volume. The default is `/Volumes/PfeiferDev/DevCaches/chris/expo-builds`.
- Expo dependencies installed. Port `8091` must be free for the dedicated Metro process.

## Run

From `expo/`:

```sh
npm run e2e:android-auto
npm run e2e:android-auto:portrait
```

Or from the repository root:

```sh
npm run e2e:android-auto
npm run e2e:android-auto:portrait
```

The default suite is [`suite.json`](./suite.json). To use another suite from `expo/`, pass its path after `--`:

```sh
npm run e2e:android-auto -- /absolute/path/to/suite.json
```

The portrait command uses [`suite-portrait.json`](./suite-portrait.json) with the cluster display enabled. It starts active guidance, toggles between 3D follow and route overview in both directions, verifies the camera changes visually, and checks the route-only overlay state.

## Coverage

The default suite contains nine ordered scenarios:

1. Connect to Android Auto and render the Mapbox map, with service and session wake-lock checks.
2. Switch between day and night presentation.
3. Show native Android Auto search results for Walmart.
4. Offer two routes to Austin Central Library and start the private route.
5. Toggle from 3D follow to route overview and back.
6. Advance active guidance with Android Auto's `AUTO_DRIVE` test command.
7. Keep guidance and the session wake lock alive while the phone sleeps.
8. Handle the Android Auto host's Stop action and return to the host dashboard while the car session remains connected.
9. Disconnect and release the Android Auto service and session wake lock.

## Artifacts

Each run creates a timestamped directory at:

```text
$DAF_EAS_LOCAL_BUILD_ROOT/android-auto-e2e/<timestamp>/
```

With defaults, this is under `/Volumes/PfeiferDev/DevCaches/chris/expo-builds/android-auto-e2e/`. The directory includes DHU screenshots, matching OCR text, `harness.log`, `metro.log`, `dhu.log`, and `android-logcat.txt`.

## Lifecycle and cleanup

The harness stops an existing instance of the selected DHU binary, starts a dedicated Metro server on port `8091`, clears the development app's data, grants test permissions, sets the Austin test location, and starts the Android Auto head-unit server if needed. It loads the app through the development-client URL before connecting DHU, preventing the headless car service from racing Expo's development loader; one bounded retry handles an interrupted Expo startup. DHU then connects and the runner separately requires the car service, session wake lock, `AutoPlayRoot`, and Mapbox-ready marker.

Cleanup runs after success, failure, `SIGINT`, or `SIGTERM`. It wakes the phone if necessary, stops the managed DHU, stops the head-unit server only when the harness started it, force-stops the launched app, stops its Metro process, and resets emulator location. It does not shut down the emulator. A head-unit server that was already running is left running.

## Overrides

- `DAF_EAS_LOCAL_BUILD_ROOT`: mounted external build root; also supplies artifact and temporary storage.
- `ANDROID_AUTO_E2E_DEVICE` or `ANDROID_SERIAL`: emulator serial.
- `ANDROID_HOME`: Android SDK root when `adb` discovery is not sufficient.
- `ANDROID_AUTO_E2E_DHU_BINARY`: DHU executable path.
- `ANDROID_AUTO_E2E_DHU_CONFIG`: DHU configuration path; it must use the suite's `1280x720` resolution.
- `ANDROID_AUTO_E2E_ARTIFACTS_DIR`: artifact root when invoking `android-auto-e2e.mjs` directly. The shell wrapper sets this from `DAF_EAS_LOCAL_BUILD_ROOT`.

## Deterministic command seam

Search and directions scenarios use an E2E-only deep link while `EXPO_PUBLIC_E2E_MAP_API_MOCKS=1` is set by the managed Metro process. This deterministically supplies the recognized query, after which the app's routing/search flow, Android Auto service, native templates, DHU rendering, and host actions are exercised.

The harness does **not** automate Google Assistant speech recognition or Android Auto host-keyboard text entry. It validates the end-to-end car experience downstream of a recognized query, not microphone/audio transcription or host text-input behavior.
