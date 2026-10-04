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

The portrait command uses [`suite-portrait.json`](./suite-portrait.json) with the primary portrait display. Instrument-cluster support stays disabled, matching `car-display-config.js`; this suite does not claim cluster coverage. It starts active guidance, toggles between 3D follow and route overview in both directions, verifies the camera changes visually using its map-only `mapCrop`, and checks the route-only overlay state. View toggles use the same app-handler command as the landscape suite rather than host-layout-dependent coordinates.

## Coverage

The default suite replays the saved WI-164/Pewaukee Road route from [`route-pewaukee.json`](./route-pewaukee.json), using its detailed geometry and estimated duration. Map API mocks are disabled. GPS position, speed, and course are sent through the emulator's authenticated GPS API and checked against Android's GPS provider after each segment; internal `AUTO_DRIVE` and synthetic camera crossings are not used.

The default suite has 17 scenarios. It runs these eight flows in both Dashboard and Fullscreen, then disconnects and verifies that the Android Auto service stops:

1. Render the Mapbox map and confirm the selected host layout and visible user puck.
2. Switch between day and night presentation.
3. Show an upcoming warning for a mapped ALPR on the saved road.
4. Confirm the camera after passing it through emulator GPS.
5. Hold the confirmation camera while GPS moves, expire it, and restore the user puck and map status.
6. Continue the saved route while the phone sleeps and verify map movement.
7. Press **Still there / Dismiss**, restore follow, and assert that no report was queued.
8. Press **Not there**, assert one queued report for the canonical OSM camera ID, verify **Thanks!** and **Ok**, then press **Ok** and verify dismissal and restored follow.

The saved-route checks use live camera inventory. The existing portrait suite remains an opt-in route-view UI check.

Dashboard and Fullscreen checks identify Android Auto's own view-switch button in each fresh screenshot. They do not depend on a media app being installed, its title, or its card finishing loading. An unrecognized or incorrect host layout fails the test; each screenshot's layout evidence is saved in a matching `.layout.json` file.

The default suite checks the arrow puck's blue body, shape and white outline in fresh DHU screenshots at connection, on approach, after confirmation, and before and after driving with the phone asleep. A visible map or accuracy circle alone cannot satisfy that check. Confirmation stability combines continuous native camera position samples and movement aggregates with six DHU frames captured while GPS advances. Button taps use OCR text bounds from the current host screenshot.

After establishing GPS motion, a development-only command clears warning history and confirmation cooldowns so warnings consumed during startup do not suppress the drive; this command keeps API mocks disabled. In the E2E environment, missing-camera reports remain in the local encrypted outbox. These UI tests do not submit false reports against the live camera inventory.

## Artifacts

Each run creates a timestamped directory at:

```text
$DAF_EAS_LOCAL_BUILD_ROOT/android-auto-e2e/<timestamp>/
```

With defaults, this is under `/Volumes/PfeiferDev/DevCaches/chris/expo-builds/android-auto-e2e/`. The directory includes DHU screenshots, matching OCR text, `harness.log`, `metro.log`, `dhu.log`, `android-logcat.txt`, and a copy of the replayed route.

## Lifecycle and cleanup

The harness stops an existing instance of the selected DHU binary, starts a dedicated Metro server on port `8091`, clears the development app's data, grants test permissions, sets the suite's starting location, and starts the Android Auto head-unit server if needed. It waits for both bundle delivery and the mounted phone root before connecting DHU, preventing the headless car service from racing Expo's development loader; one bounded retry handles an interrupted Expo startup. DHU then connects and the runner separately requires the car service, session wake lock, `AutoPlayRoot`, and Mapbox-ready marker.

Cleanup runs after success, failure, `SIGINT`, or `SIGTERM`. It wakes the phone if necessary, stops the managed DHU, stops the head-unit server only when the harness started it, force-stops the launched app, clears isolated test app data when this run queued reports, stops its Metro process, and resets emulator location. It does not shut down the emulator. A head-unit server that was already running is left running.

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
