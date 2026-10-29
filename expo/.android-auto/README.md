# Android Auto end-to-end tests

This harness exercises the installed Android development build through the Android Auto Desktop Head Unit (DHU). It drives the DHU over stdin, checks native car-app screens with macOS Vision OCR, watches Metro markers, and verifies Android service and wake-lock state.

## Prerequisites

- macOS with Xcode command-line tools (`xcrun`, `swiftc`) so the Vision OCR helper can be compiled. DHU taps use its stdin protocol; drags and list scrolling use Android input injection into the active projection display, without moving the desktop cursor or activating a macOS window.
- The Android SDK and `adb`, plus the Android Auto DHU. The default DHU path is `$ANDROID_HOME/extras/google/auto/desktop-head-unit`.
- Android Auto developer mode enabled on the emulator, with the **Start head unit server** control available.
- Exactly one running Android emulator, unless `ANDROID_AUTO_E2E_DEVICE` or `ANDROID_SERIAL` selects one explicitly.
- A compatible development build installed. The default suite expects `com.anonymous.drivefree.dev` and its `AndroidAutoService`.
- The configured development API reachable, with search, routing, and OSM database access working. For the local backend, keep the repository's [OSM database tunnel](../../infrastructure/aws/osm/operations/start-local-tunnel.sh) running when its database connection uses `127.0.0.1:15432`.
- `expo/.env.development.local` copied from the primary checkout and containing a non-empty `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`. The runner checks the key without logging its value; do not commit the file.
- A writable external build root under a mounted `/Volumes/...` volume. The default is `/Volumes/PfeiferDev/DevCaches/chris/expo-builds`.
- Expo dependencies installed. Port `8091` must be free for the dedicated Metro process.

## Run

From `expo/`:

```sh
npm run e2e:android-auto
npm run e2e:android-auto:portrait
npm run e2e:android-auto:ui
npm run e2e:android-auto:ui:portrait
npm run e2e:android-auto:route-choices
npm run e2e:android-auto:route-choices:portrait
npm run e2e:android-auto:alpr
npm run e2e:android-auto -- --list
```

Or from the repository root:

```sh
npm run e2e:android-auto
npm run e2e:android-auto:portrait
npm run e2e:android-auto:ui
npm run e2e:android-auto:ui:portrait
npm run e2e:android-auto:route-choices
npm run e2e:android-auto:route-choices:portrait
npm run e2e:android-auto:alpr
npm run e2e:android-auto -- --list
```

The default suite is [`suite.json`](./suite.json). To use another suite from `expo/`, pass its path after `--`:

```sh
npm run e2e:android-auto -- /absolute/path/to/suite.json
```

The portrait command uses [`suite-portrait.json`](./suite-portrait.json) with the primary portrait display. It inherits the scenarios from `suite.json` and overrides the DHU display, screenshot regions, and host control coordinates. Instrument-cluster support stays disabled, matching `car-display-config.js`; this suite does not claim cluster coverage.

## Coverage

Both landscape and portrait suites replay the saved WI-164/Pewaukee Road route from [`route-pewaukee.json`](./route-pewaukee.json), using its detailed geometry and estimated duration. Map API mocks are disabled. GPS position, speed, and course are sent through the emulator's authenticated GPS API and checked against Android's GPS provider after each segment; internal `AUTO_DRIVE` and synthetic camera crossings are not used.

Each orientation selects 43 scenarios: the original 16 driving checks, 26 stationary UI checks, and a final disconnect/service-stop check. The ALPR group retains the original 17 scenarios. Its eight flows run in both Dashboard and Fullscreen:

1. Render the Mapbox map and confirm the selected host layout and visible user puck.
2. Switch between day and night presentation.
3. Show an upcoming warning for a mapped ALPR on the saved road.
4. Confirm the camera after passing it through emulator GPS.
5. Hold the confirmation camera while GPS moves, expire it, and restore the user puck and map status.
6. Continue the saved route while the phone sleeps and verify map movement.
7. Press **Still there / Dismiss**, restore follow, and assert that no report was queued.
8. Press **Not there**, assert one queued report for the canonical OSM camera ID, verify **Thanks!** and **Ok**, then press **Ok** and verify dismissal and restored follow.

The saved-route checks use live camera inventory. Before day/night checks, the harness temporarily selects Android Auto’s **Automatic** map mode so DHU day/night commands take effect, then restores the previous mode during cleanup.

The stationary UI group mirrors the CarPlay feature coverage with 13 scenarios in each Android Auto host layout: pan/recenter; available map and route settings; Standard/Satellite and all five time-of-day choices with state and rendered-map confirmation; absent Home/Work; native Home/Work route previews; live saved-place updates and Work fallback; Recents/Favorites; native keyboard autocomplete and selection; recognized Walmart and Walmart Delafield searches; results remaining visible until selection; and route startup, turn/arrival estimates, options, steps, overview, and native stop. Android Auto uses its Search screen and header shortcuts for saved places; CarPlay Dashboard shortcut precedence is specific to CarPlay.

Each stationary case resets navigation/templates, seeds the same saved-place fixture used by CarPlay, uses a stationary GPS point between Home and Work with zero speed, and verifies the requested host layout. The recorded driving replay keeps its original start coordinate. Native lists can occupy a different area from the root map, so list OCR does not apply the map-layout assertion. Map icon positions use each layout's `appBounds` and current header state; `appBounds.controls` can override individual screenshot coordinates for another host version. Portrait taps account for the cropped DHU touch display; drags use coordinates local to the Android Auto virtual display. The input display is discovered for every gesture and must belong to Android Auto; there is no fallback to desktop mouse input.

The CarPlay harness also keeps input in the background: it sends window-addressed events directly to CarPlay Simulator and presses its toolbar through Accessibility. It never activates the simulator or posts desktop mouse events. Its macOS helper requires `CGEventSetWindowLocation` to supply window-local coordinates and fails if that symbol is unavailable. The map-pan case opens CarPlay's native Pan interface before dragging and measures map movement after that interface opens.

Filter without running earlier scenarios:

```sh
ANDROID_AUTO_E2E_SCENARIO="Keyboard" npm run e2e:android-auto:ui
ANDROID_AUTO_E2E_SUITE=alpr npm run e2e:android-auto:portrait
```

`--list` and `--help` run without ADB, DHU, or external artifact storage. Filtering still retains the final disconnect check.

Dashboard and Fullscreen checks identify Android Auto's own view-switch button in each fresh screenshot. They do not depend on a media app being installed, its title, or its card finishing loading. An unrecognized or incorrect host layout fails the test; each screenshot's layout evidence is saved in a matching `.layout.json` file.

Both suites check the arrow puck's blue body, shape and white outline in fresh DHU screenshots at connection, on approach, after confirmation, and before and after driving with the phone asleep. A visible map or accuracy circle alone cannot satisfy that check. Confirmation stability combines continuous native camera position samples and movement aggregates with six DHU frames captured while GPS advances. Button taps use OCR text bounds from the current host screenshot. Portrait screenshots retain the side margins; the runner subtracts the configured touch offset when tapping the cropped DHU window.

After establishing GPS motion, a development-only command clears warning history and confirmation cooldowns so warnings consumed during startup do not suppress the drive; this command keeps API mocks disabled. In the E2E environment, missing-camera reports remain in the local encrypted outbox. These UI tests do not submit false reports against the live camera inventory.

## Artifacts

Each run creates a timestamped directory at:

```text
$DAF_EAS_LOCAL_BUILD_ROOT/android-auto-e2e/<timestamp>/
```

With defaults, this is under `/Volumes/PfeiferDev/DevCaches/chris/expo-builds/android-auto-e2e/`. The directory includes per-scenario `results.json`, a failure screenshot when capture is available, DHU screenshots, matching OCR text, `harness.log`, `metro.log`, `dhu.log`, `android-logcat.txt`, and a copy of the replayed route.

## Lifecycle and cleanup

The harness stops an existing instance of the selected DHU binary, starts a dedicated Metro server on port `8091`, clears the development app's data, grants test permissions, sets the suite's starting location, and starts the Android Auto head-unit server if needed. It waits for both bundle delivery and the mounted phone root before connecting DHU, preventing the headless car service from racing Expo's development loader; one bounded retry handles an interrupted Expo startup. DHU then connects and the runner separately requires the car service, session wake lock, `AutoPlayRoot`, and Mapbox-ready marker.

Cleanup runs after success, failure, `SIGINT`, or `SIGTERM`. It wakes the phone if necessary, stops the managed DHU, stops the head-unit server only when the harness started it, force-stops the launched app, clears isolated test app data when this run queued reports, stops its Metro process, and resets emulator location. It does not shut down the emulator. A head-unit server that was already running is left running.

## Overrides

- `DAF_EAS_LOCAL_BUILD_ROOT`: mounted external build root; also supplies artifact and temporary storage.
- `ANDROID_AUTO_E2E_DEVICE` or `ANDROID_SERIAL`: emulator serial.
- `ANDROID_AUTO_E2E_SUITE`: `all` (default), `alpr`, `navigation`, or `route-choices`.
- `ANDROID_AUTO_E2E_SCENARIO`: case-insensitive substring of scenario names.
- `ANDROID_HOME`: Android SDK root when `adb` discovery is not sufficient.
- `ANDROID_AUTO_E2E_DHU_BINARY`: DHU executable path.
- `ANDROID_AUTO_E2E_DHU_CONFIG`: DHU configuration path; it must match the suite's display resolution.
- `ANDROID_AUTO_E2E_ARTIFACTS_DIR`: artifact root when invoking `android-auto-e2e.mjs` directly. The shell wrapper sets this from `DAF_EAS_LOCAL_BUILD_ROOT`.

## Input and fixture seams

Stationary setup and state reads use E2E-only `e2e-android-auto` links. These do not enable API mocks. Seeded Home, Work, Recent and Favorite places include matching entries in the normal place-details cache so their synthetic IDs are never sent to the live place lookup API. Keyboard cases tap the native search field and OCR-identified QWERTY keys, then require the autocomplete callback and a native result selection. Voice cases supply a fixed recognized query through the same app request path used after host recognition; Google Assistant microphone/audio transcription is not exercised. Search and directions use live APIs in the standard suites, matching CarPlay, so results and network availability can vary.

The standalone route-choice commands run the seven preview/search/navigation scenarios in both layouts (14 checks plus disconnect). CarPlay exposes the same seven cases with `npm run e2e:carplay:route-choices`. These cases remain included in the default and UI suites. Every preview waits for native Mapbox zoom to decrease from a settled driving view, all route-choice bounds to fit inside the host-visible map, and the selected route line to appear in native rendered-feature queries and screenshot pixels along its projected path. The camera and visible line must remain stable for at least 1.5 seconds before Back or Start can run. Each preview saves `*-overview.json` with baseline, native camera, viewport, route and pixel evidence alongside its screenshots.

The older `e2e-mocks` command seam remains available to custom suites that explicitly enable mocked APIs. It stays blocked in live-GPS suites.
