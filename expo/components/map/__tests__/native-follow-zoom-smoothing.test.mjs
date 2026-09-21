import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const ios = readFileSync(
    new URL(
        '../../../modules/map-location-puck/ios/MapLocationPuckModule.swift',
        import.meta.url,
    ),
    'utf8',
);
const android = readFileSync(
    new URL(
        '../../../modules/map-location-puck/android/src/main/java/expo/modules/maplocationpuck/MapLocationPuckModule.kt',
        import.meta.url,
    ),
    'utf8',
);

function smoothingSource(source) {
    const start = source.indexOf('private func smoothCameraFollowZoom');
    const androidStart = source.indexOf('private fun smoothCameraFollowZoom');
    assert.ok(
        start >= 0 || androidStart >= 0,
        'native follow zoom smoother exists',
    );
    return source.slice(
        Math.max(start, androidStart),
        source.indexOf('private ', Math.max(start, androidStart) + 12),
    );
}

test('native zoom smoothing leaves camera position and bearing to the puck viewport', () => {
    for (const source of [ios, android]) {
        const smoothing = smoothingSource(source);
        assert.match(smoothing, /followState\.options =/);
        assert.doesNotMatch(
            smoothing,
            /setCamera|easeTo|flyTo|transitionTo|\.transition\(|\.center\(|\.bearing\(/,
        );
    }
});

test('native zoom changes begin at the rendered zoom and complete in 750 ms', () => {
    assert.match(ios, /cameraFollowZoomDurationSeconds = 0\.75/);
    assert.match(android, /CAMERA_FOLLOW_ZOOM_DURATION_MS = 750L/);
    for (const source of [ios, android]) {
        assert.match(smoothingSource(source), /cameraState\.zoom/);
        assert.match(
            smoothingSource(source),
            /3(?:\.0)? - 2(?:\.0)? \* progress/,
        );
    }
});

test('zoom animation checks provider and viewport ownership before each option update', () => {
    for (const source of [ios, android]) {
        assert.match(
            smoothingSource(source),
            /liveLocationProviderIsOwned[\s\S]*?viewportOwnsCameraFollowState[\s\S]*?followState\.options =/,
        );
    }
    assert.match(ios, /\[weak self, weak mapView, weak followState\]/);
    assert.match(android, /val mapViewReference = WeakReference\(mapView\)/);
});

test('disabling follow cancels smoothing before releasing the viewport', () => {
    assert.match(
        ios,
        /private func clearCameraFollowState[\s\S]*?cameraFollowZoomTimers\.object\(forKey: mapView\)\?\.invalidate\(\)[\s\S]*?cameraFollowStates\.removeObject/,
    );
    assert.match(
        android,
        /private fun clearCameraFollowState[\s\S]*?cameraFollowZoomAnimators\.remove\(mapView\)\?\.cancel\(\)[\s\S]*?cameraFollowStates\.remove/,
    );
});

test('active follow updates reuse the viewport while initial and idle states retain their handoff', () => {
    assert.match(
        ios,
        /case \.state\(let activeState\) = mapView\.viewport\.status[\s\S]*?activeState === followState[\s\S]*?smoothCameraFollowZoom[\s\S]*?return true[\s\S]*?transitionImmediately/,
    );
    assert.match(
        android,
        /status is ViewportStatus\.State && status\.state === followState[\s\S]*?smoothCameraFollowZoom[\s\S]*?return@Coroutine true[\s\S]*?makeImmediateViewportTransition/,
    );
});

test(
    'Swift smoother retargets without a jump and stops after ownership loss',
    {
        skip:
            process.platform !== 'darwin' && 'requires the macOS Swift runtime',
    },
    () => {
        const directory = mkdtempSync(join(tmpdir(), 'follow-zoom-test-'));
        // Execute the production smoother with a deterministic clock and minimal
        // viewport doubles. This does not build the iOS app or load Mapbox.
        const swift = `
import Foundation
${ios.match(/private let cameraFollowZoomDurationSeconds = [\d.]+/)[0]}

@MainActor final class ProcessInfo {
  static let processInfo = ProcessInfo()
  var systemUptime = 0.0
}
@MainActor final class Timer {
  var valid = true
  let callback: (Timer) -> Void
  init(timeInterval: Double, repeats: Bool, block: @escaping (Timer) -> Void) {
    callback = block
  }
  func invalidate() { valid = false }
  func fire() { if valid { callback(self) } }
}
@MainActor final class RunLoop {
  enum Mode { case common }
  static let main = RunLoop()
  func add(_ timer: Timer, forMode: Mode) {}
}
struct FollowPuckViewportStateOptions {
  var zoom: CGFloat?
  var pitch: CGFloat? = 45
  var padding = 120
}
@MainActor final class FollowPuckViewportState {
  var options = FollowPuckViewportStateOptions(zoom: 18)
}
@MainActor final class MapView {
  final class MapboxMap {
    struct CameraState { var zoom: CGFloat = 18 }
    var cameraState = CameraState()
  }
  let mapboxMap = MapboxMap()
  let viewport = NSObject()
  var providerOwned = true
}
@MainActor final class Smoother {
  let cameraFollowZoomTimers = NSMapTable<MapView, Timer>(keyOptions: .weakMemory, valueOptions: .strongMemory)
  let cameraFollowStates = NSMapTable<MapView, FollowPuckViewportState>(keyOptions: .weakMemory, valueOptions: .strongMemory)
  var viewportOwned = true
  func liveLocationProviderIsOwned(on mapView: MapView) -> Bool { mapView.providerOwned }
  func viewportOwnsCameraFollowState(_ viewport: NSObject, followState: FollowPuckViewportState) -> Bool { viewportOwned }
  ${smoothingSource(ios)
      .replace('private func', 'func')
      .replace(/\s*@MainActor\s*$/, '')}
}

MainActor.assumeIsolated {
  let smoother = Smoother()
  let map = MapView()
  let state = FollowPuckViewportState()
  smoother.cameraFollowStates.setObject(state, forKey: map)
  let target = FollowPuckViewportStateOptions(zoom: 16, pitch: 50, padding: 200)
  smoother.smoothCameraFollowZoom(on: map, followState: state, options: target)
  precondition(state.options.zoom == 18, "start must not snap to target")
  precondition(state.options.pitch == 50 && state.options.padding == 200)
  let first = smoother.cameraFollowZoomTimers.object(forKey: map)!
  ProcessInfo.processInfo.systemUptime = 0.1875
  first.fire()
  precondition(abs(state.options.zoom! - 17.6875) < 0.000001)
  ProcessInfo.processInfo.systemUptime = 0.375
  first.fire()
  precondition(state.options.zoom == 17, "midpoint must be between endpoints")

  // A new target begins at the rendered camera value, not the old endpoint.
  map.mapboxMap.cameraState.zoom = 17
  smoother.smoothCameraFollowZoom(on: map, followState: state,
    options: FollowPuckViewportStateOptions(zoom: 19))
  precondition(state.options.zoom == 17)
  let second = smoother.cameraFollowZoomTimers.object(forKey: map)!
  first.fire()
  precondition(!first.valid && state.options.zoom == 17, "superseded callback must not write")
  ProcessInfo.processInfo.systemUptime = 1.125
  second.fire()
  precondition(state.options.zoom == 19 && !second.valid)
  precondition(smoother.cameraFollowZoomTimers.object(forKey: map) == nil)

  for loseProvider in [false, true] {
    smoother.viewportOwned = true
    map.providerOwned = true
    smoother.smoothCameraFollowZoom(on: map, followState: state, options: target)
    let timer = smoother.cameraFollowZoomTimers.object(forKey: map)!
    let before = state.options.zoom
    if loseProvider { map.providerOwned = false } else { smoother.viewportOwned = false }
    ProcessInfo.processInfo.systemUptime += 0.375
    timer.fire()
    precondition(!timer.valid && state.options.zoom == before, "lost ownership must stop writes")
  }

  smoother.viewportOwned = true
  map.providerOwned = true
  let otherMap = MapView()
  let otherState = FollowPuckViewportState()
  smoother.cameraFollowStates.setObject(otherState, forKey: otherMap)
  smoother.smoothCameraFollowZoom(on: otherMap, followState: otherState, options: target)
  let otherTimer = smoother.cameraFollowZoomTimers.object(forKey: otherMap)!
  ProcessInfo.processInfo.systemUptime += 0.75
  otherTimer.fire()
  precondition(otherState.options.zoom == 16, "each map must own its zoom independently")
  precondition(state.options.zoom == 17)
  print("native zoom behavior passed")
}
`;

        try {
            const file = join(directory, 'follow-zoom.swift');
            writeFileSync(file, swift);
            const result = spawnSync(
                'xcrun',
                ['swift', '-module-cache-path', join(directory, 'cache'), file],
                {
                    encoding: 'utf8',
                    timeout: 60_000,
                },
            );
            assert.equal(
                result.status,
                0,
                result.stderr || result.error?.message,
            );
            assert.match(result.stdout, /native zoom behavior passed/);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    },
);
