import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as modes from '../driving-map-view.js';

const surface = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const bridge = readFileSync(
    new URL('../location-puck-3d.js', import.meta.url),
    'utf8',
);

test('idle compass toggles north-up follow while navigation keeps route overview', () => {
    const northUp = 'north-up';
    assert.equal(
        modes.getNextDrivingMapViewMode('perspective', {
            hasActiveDirectionsRoute: false,
        }),
        northUp,
    );
    assert.equal(
        modes.getNextDrivingMapViewMode(northUp, {
            hasActiveDirectionsRoute: false,
        }),
        'perspective',
    );
    assert.equal(
        modes.getNextDrivingMapViewMode('perspective'),
        'route-overview',
    );
    assert.equal(
        modes.getNextDrivingMapViewMode('route-overview'),
        'perspective',
    );
    assert.deepEqual(modes.getDrivingMapViewFollowConfiguration(northUp), {
        pitch: 0,
        heading: 0,
        zoomOffset: -3,
    });
    assert.equal(modes.shouldShowDrivingMapStatus(northUp), true);
    assert.equal(
        modes.shouldRestoreDrivingPerspective({
            hasActiveDirectionsRoute: false,
            isRootMapSurface: true,
            mode: northUp,
        }),
        false,
    );
    assert.equal(
        modes.shouldRestoreDrivingPerspective({
            hasActiveDirectionsRoute: true,
            isRootMapSurface: true,
            mode: northUp,
        }),
        true,
    );
});

test('the shared compass handler accepts idle presses and respects camera ownership', () => {
    let mode = 'perspective';
    let allowed = true;
    const context = vm.createContext({
        ...modes,
        activeDirectionsRoute: null,
        isRootMapSurface: true,
        drivingMapViewMode: mode,
        controller: { cameraUpdatesAreAllowed: () => allowed },
        useCallback: (callback) => callback,
        setAutoPlayState: (state) => {
            mode = state.drivingMapViewMode;
        },
        logAutoPlayMapSurfaceAction() {},
    });
    vm.runInContext(
        surface.slice(
            surface.indexOf('const handleDrivingMapViewPress = useCallback'),
            surface.indexOf(
                '    useEffect(() => {',
                surface.indexOf(
                    'const handleDrivingMapViewPress = useCallback',
                ),
            ),
        ) + '\nglobalThis.press = handleDrivingMapViewPress;',
        context,
    );
    context.press();
    assert.equal(mode, 'north-up');
    context.drivingMapViewMode = mode;
    allowed = false;
    context.press();
    assert.equal(mode, 'north-up');
    allowed = true;
    context.press();
    assert.equal(mode, 'perspective');
    context.activeDirectionsRoute = {};
    context.drivingMapViewMode = mode;
    context.press();
    assert.equal(mode, 'route-overview');
});

test('native follow receives fixed north bearing and clears it when perspective resumes', async () => {
    const calls = [];
    const context = vm.createContext({
        getSupportedMapViewTag: () => 42,
        isLocationPuckCameraFollowSupported: () => true,
        getFiniteNumber: (value) =>
            Number.isFinite(Number(value)) ? Number(value) : null,
        getCameraPaddingValue: (padding, key) => padding?.[key] ?? 0,
        mapLocationPuckModule: {
            setLocationPuckCameraFollowBearing: async (...args) =>
                calls.push(['bearing', ...args]),
            setLocationPuckCameraFollow: async (...args) => {
                calls.push(['follow', ...args]);
                return true;
            },
        },
    });
    vm.runInContext(
        bridge
            .slice(
                bridge.indexOf(
                    'export async function setLocationPuckCameraFollowAsync',
                ),
                bridge.indexOf(
                    'export async function isLocationPuckCameraFollowActiveAsync',
                ),
            )
            .replace('export ', ''),
        context,
    );
    for (const heading of [0, undefined]) {
        await context.setLocationPuckCameraFollowAsync(
            {},
            {
                enabled: true,
                heading,
                pitch: heading === 0 ? 0 : 55,
                zoomLevel: 14,
            },
        );
    }
    assert.deepEqual(
        calls.map((call) => call.slice(0, 3)),
        [
            ['bearing', 42, 0],
            ['follow', 42, true],
            ['bearing', 42, null],
            ['follow', 42, true],
        ],
    );
    delete context.mapLocationPuckModule.setLocationPuckCameraFollowBearing;
    assert.equal(
        await context.setLocationPuckCameraFollowAsync(
            {},
            { enabled: true, heading: 0 },
        ),
        false,
    );
    assert.equal(
        await context.setLocationPuckCameraFollowAsync({}, { enabled: true }),
        true,
    );
});
