import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

function createHarness() {
    const events = [];
    const cameraStops = [];
    let finishRelease;
    const context = vm.createContext({
        useCallback: (callback) => callback,
        isDrivingMode: true,
        isMountedRef: { current: true },
        isMapReadyRef: { current: true },
        manualMapGestureGenerationRef: { current: 0 },
        markerLoadsEnabledRef: { current: false },
        currentZoomRef: { current: 10 },
        getCameraUpdateGuard: () => () => context.isMountedRef.current,
        getViewportCameraPadding: () => ({ paddingTop: 48 }),
        followLocationMode: { pauseUntilRecenter: () => events.push('pause') },
        locationPuckCameraFollowReleaseRef: {
            current: () => {
                events.push('release');
                return new Promise((resolve) => {
                    finishRelease = resolve;
                });
            },
        },
        presenceInterruptRef: { current: () => events.push('interrupt') },
        cameraRef: { current: { setCamera: (stop) => cameraStops.push(stop) } },
    });
    const start = source.indexOf('const handleManeuverFocus = useCallback(');
    const end = source.indexOf('const fitDrivingCameraToBounds', start);
    assert.ok(start > 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
    const focus = vm.runInContext('handleManeuverFocus', context);
    return {
        context,
        events,
        cameraStops,
        focus,
        finishRelease: (value) => finishRelease(value),
    };
}

test('maneuver preview waits for native follow release, then frames the step with car padding', async () => {
    const { context, events, cameraStops, focus, finishRelease } =
        createHarness();
    const pending = focus([-87, 41], { heading: 95 });
    assert.deepEqual(events, ['interrupt', 'pause', 'release']);
    assert.equal(cameraStops.length, 0);
    finishRelease(true);
    assert.equal(await pending, true);
    const stop = JSON.parse(JSON.stringify(cameraStops[0]));
    assert.deepEqual(stop.centerCoordinate, [-87, 41]);
    assert.equal(stop.heading, 95);
    assert.equal(stop.zoomLevel, 16);
    assert.equal(stop.pitch, 0);
    assert.deepEqual(stop.padding, { paddingTop: 48 });
    assert.equal(context.currentZoomRef.current, 16);
});

test('pending previews cannot overwrite Recenter, a new route, unmount, or failed native release', async () => {
    for (const reason of [
        'recenter',
        'route-changed',
        'unmounted',
        'release-failed',
    ]) {
        const { context, cameraStops, focus, finishRelease } = createHarness();
        let current = true;
        const pending = focus([-87, 41], { shouldApply: () => current });
        if (reason === 'recenter')
            context.manualMapGestureGenerationRef.current += 1;
        if (reason === 'route-changed') current = false;
        if (reason === 'unmounted') context.isMountedRef.current = false;
        finishRelease(reason !== 'release-failed');
        assert.equal(await pending, false, reason);
        assert.equal(cameraStops.length, 0, reason);
    }
});

test('invalid coordinates and an unavailable map cannot pause navigation follow', async () => {
    for (const coordinate of [null, [], [NaN, 41], [-87, 91], [181, 41]]) {
        const { focus, events } = createHarness();
        assert.equal(await focus(coordinate), false);
        assert.deepEqual(events, []);
    }
    const { context, focus, events } = createHarness();
    context.isMapReadyRef.current = false;
    assert.equal(await focus([-87, 41]), false);
    assert.deepEqual(events, []);
});

test('the root map exposes maneuver focus to both automotive platforms', () => {
    assert.match(
        source,
        /registerAutoPlayMapControlHandlers\(\{[^]*?handleManeuverFocus: controller\.handleManeuverFocus/,
    );
});
