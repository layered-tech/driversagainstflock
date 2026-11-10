import assert from 'node:assert/strict';
import test from 'node:test';
import * as displaySpeed from '../display-speed-state.js';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';
import { loadSpeedDisplayModules } from './speed-display-test-helpers.mjs';

function createSpeedHarness(t) {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
    const hooks = createHookHarness();
    const { useDisplaySpeed } = loadTourModule(
        new URL('../use-display-speed.js', import.meta.url),
        { react: hooks.react, './display-speed-state': displaySpeed },
    );
    let input = { enabled: true, speedMps: undefined, recordedAt: 1000 };
    t.after(() => hooks.cleanup());

    return {
        update(next = {}) {
            input = { ...input, ...next };
            return hooks.render(() => useDisplaySpeed(input));
        },
        tick(ms) {
            t.mock.timers.tick(ms);
            return hooks.render(() => useDisplaySpeed(input));
        },
        hooks,
    };
}

test('speed formatting distinguishes unavailable values from genuine zero', () => {
    for (const value of [
        null,
        undefined,
        '',
        '  ',
        -1,
        '-1',
        NaN,
        Infinity,
        -Infinity,
        false,
        [],
        {},
    ]) {
        assert.equal(
            displaySpeed.getCurrentSpeedMph(value),
            null,
            String(value),
        );
    }
    assert.equal(displaySpeed.getCurrentSpeedMph(0), 0);
    assert.equal(displaySpeed.getCurrentSpeedMph('0'), 0);
    assert.equal(displaySpeed.getCurrentSpeedMph(20), 45);
});

test('holds an unavailable speed until two seconds after the valid fix, then expires without a new fix', (t) => {
    const speed = createSpeedHarness(t);
    assert.equal(speed.update({ speedMps: 20 }), 20);
    speed.tick(500);
    assert.equal(speed.update({ speedMps: undefined, recordedAt: 2000 }), 20);
    assert.equal(speed.tick(1499), 20);
    assert.equal(speed.tick(1), null);
    assert.equal(speed.update({ speedMps: 21, recordedAt: 3000 }), 21);
});

test('recovery cancels expiry and a genuine zero is shown immediately', (t) => {
    const speed = createSpeedHarness(t);
    speed.update({ speedMps: 20 });
    speed.tick(500);
    assert.equal(speed.update({ speedMps: null, recordedAt: 2000 }), 20);
    speed.tick(500);
    assert.equal(speed.update({ speedMps: 22, recordedAt: 3000 }), 22);
    assert.equal(speed.tick(1000), 22);
    assert.equal(speed.update({ speedMps: 0, recordedAt: 4000 }), 0);
    assert.equal(speed.update({ speedMps: undefined, recordedAt: 5000 }), 0);
    assert.equal(speed.tick(2000), null);
});

test('duplicates, heading-only renders, and unavailable updates cannot extend the hold', (t) => {
    const speed = createSpeedHarness(t);
    speed.update({ speedMps: 20 });
    speed.tick(1000);
    speed.update({ speedMps: 20, recordedAt: 1000, heading: 90 });
    speed.tick(500);
    assert.equal(speed.update({ speedMps: undefined, recordedAt: 2000 }), 20);
    speed.tick(400);
    assert.equal(speed.update({ recordedAt: 3000 }), 20);
    assert.equal(speed.tick(100), null);
    assert.equal(speed.update({ recordedAt: 4000 }), null);
});

test('a distinct valid fix renews the window, but same-fix enrichment does not', (t) => {
    const speed = createSpeedHarness(t);
    speed.update({ speedMps: 20 });
    speed.tick(1500);
    speed.update({ speedMps: 21, recordedAt: 2000 });
    speed.tick(1000);
    speed.update({ speedMps: 22, recordedAt: 2000 });
    speed.update({ speedMps: undefined, recordedAt: 3000 });
    assert.equal(speed.tick(999), 22);
    assert.equal(speed.tick(1), null);
});

test('initial missing speed and an already expired last reading stay hidden', (t) => {
    const speed = createSpeedHarness(t);
    assert.equal(speed.update(), null);
    assert.equal(speed.tick(5000), null);
    speed.update({ speedMps: 20, recordedAt: 2000 });
    speed.tick(2500);
    assert.equal(speed.update({ speedMps: undefined, recordedAt: 3000 }), null);
});

test('deactivation clears retained speed and cancels its timer', (t) => {
    const speed = createSpeedHarness(t);
    const clearTimeout = t.mock.method(globalThis, 'clearTimeout');
    speed.update({ speedMps: 20 });
    speed.update({ speedMps: undefined, recordedAt: 2000 });
    assert.equal(speed.update({ enabled: false }), null);
    assert.ok(clearTimeout.mock.callCount() > 0);
    assert.equal(speed.update({ enabled: true }), null);
    assert.equal(speed.tick(2000), null);
});

test('unmount cancels pending expiry', (t) => {
    const speed = createSpeedHarness(t);
    const clearTimeout = t.mock.method(globalThis, 'clearTimeout');
    speed.update({ speedMps: 20 });
    speed.update({ speedMps: undefined, recordedAt: 2000 });
    speed.hooks.cleanup();
    assert.ok(clearTimeout.mock.callCount() > 0);
});

function flatten(node) {
    return node && typeof node === 'object'
        ? [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)]
        : [];
}

for (const platform of ['android', 'ios']) {
    for (const withLimit of [true, false]) {
        test(`${platform} automotive display retains speed and preserves unmapped-road visibility (limit: ${withLimit})`, (t) => {
            t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
            const hooks = createHookHarness();
            t.after(() => hooks.cleanup());
            const speedModule = loadSpeedDisplayModules(hooks.react);
            const { AutoPlayMapStatusOverlay } = loadTourModule(
                new URL(
                    '../../auto-play-map-status-overlay.js',
                    import.meta.url,
                ),
                {
                    'react-native': {
                        Platform: { OS: platform },
                        useColorScheme: () => 'light',
                        View: 'View',
                    },
                    './auto-play-map-status-layout': {
                        getAutoPlaySpeedLimitBadgeSize: () => 56,
                        getAutoPlaySpeedLimitOverlayLayout: () => ({
                            positionStyle: {},
                            alignmentFrameStyle: {},
                        }),
                    },
                    './design-system/tokens': { dafSemanticColors: {} },
                    './map/driving-location-road-stack': {
                        DrivingLocationRoadStack: 'RoadStack',
                    },
                    './map/marker-loading-indicator': {
                        MarkerLoadingIndicator: 'Loading',
                    },
                    './map/navigation-puck-layout': {
                        AUTO_PLAY_NAVIGATION_PUCK_SIZE: 50,
                    },
                    './map/speed-limit': speedModule,
                    './map/speed-limit-layout': {
                        AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE: 56,
                    },
                },
            );
            let userLocation = {
                recordedAt: 1000,
                speed: 20,
                roadMatch: {
                    speedLimit: withLimit ? { speedLimitMph: 35 } : null,
                },
            };
            function render(extra = {}) {
                const tree = hooks.render(() =>
                    AutoPlayMapStatusOverlay({
                        freeDriveIsActive: true,
                        drivingStatusIsVisible: true,
                        userLocation,
                        markerLoader: {},
                        mapPreferencesAreLoaded: true,
                        presentation: {},
                        viewportMetrics: {},
                        ...extra,
                    }),
                );
                const sign = flatten(tree).find(
                    (node) => node.type === speedModule.SpeedLimitSign,
                );
                const children = sign ? flatten(sign.type(sign.props)) : [];
                return {
                    label: children.find(
                        (node) =>
                            node.props.testID ===
                            'android-auto-speed-limit-sign-current-speed-value',
                    )?.props.children,
                    limitVisible: children.some(
                        (node) =>
                            node.props.testID ===
                            'android-auto-speed-limit-value',
                    ),
                };
            }

            assert.deepEqual(render(), { label: 45, limitVisible: withLimit });
            t.mock.timers.tick(500);
            userLocation = {
                ...userLocation,
                speed: undefined,
                recordedAt: 2000,
            };
            assert.deepEqual(render(), { label: 45, limitVisible: withLimit });
            assert.equal(
                speedModule.getRouteCurrentSpeedMps(userLocation),
                undefined,
            );
            t.mock.timers.tick(1500);
            assert.deepEqual(render(), {
                label: undefined,
                limitVisible: withLimit,
            });
            userLocation = { ...userLocation, speed: 22, recordedAt: 3000 };
            assert.equal(render().label, 49);
            userLocation = { ...userLocation, speed: 0, recordedAt: 4000 };
            assert.equal(render().label, withLimit ? 0 : undefined);
            userLocation = {
                ...userLocation,
                speed: undefined,
                recordedAt: 5000,
            };
            render({ confirmationIsActive: true });
            assert.equal(render().label, undefined);
        });
    }
}
