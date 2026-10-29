import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

const iosPlatformSource = readFileSync(
    new URL('../../auto-play-platform.ios.js', import.meta.url),
    'utf8',
);
const dashboardSurfaceSource = readFileSync(
    new URL('../../carplay-dashboard-surface.ios.js', import.meta.url),
    'utf8',
);
const autoPlayMapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface.js', import.meta.url),
    'utf8',
);
const carPlayMapSurfaceSource = readFileSync(
    new URL('../../carplay-map-surface.js', import.meta.url),
    'utf8',
);
const autoPlayMapSurfaceContentSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const mapStatusOverlaySource = readFileSync(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    'utf8',
);
const appConfigSource = readFileSync(
    new URL('../../../app.config.js', import.meta.url),
    'utf8',
);
const mapLocationPuckAndroidBuildSource = readFileSync(
    new URL(
        '../../../modules/map-location-puck/android/build.gradle',
        import.meta.url,
    ),
    'utf8',
);
const mapLocationPuckPodspecSource = readFileSync(
    new URL(
        '../../../modules/map-location-puck/ios/DAFMapLocationPuck.podspec',
        import.meta.url,
    ),
    'utf8',
);

function makeDashboard(primaryLocations = {}) {
    let buttons;
    const listeners = {};
    const pressed = [];
    const platform = vm.runInNewContext(
        iosPlatformSource
            .replace(/^import .*;\n/gm, '')
            .replace(
                'export const autoPlayPlatform =',
                'const autoPlayPlatform =',
            ) + '\nautoPlayPlatform;',
        {
            AutoPlayClusterSurface() {},
            CarPlayDashboardSurface() {},
            CarPlayMapSurface() {},
            carPlayInstrumentClusterEnabled: false,
            createCarPlayVoiceSearchController: () => ({}),
        },
    );
    platform.registerPlatformListeners({
        autoPlayModule: {
            CarPlayDashboard: {
                setComponent() {},
                setButtons(value) {
                    buttons = value;
                },
                addListener(event, callback) {
                    listeners[event] = callback;
                },
            },
            ErrorUtil: {},
            HybridAutoPlay: { addListenerRenderState() {} },
        },
        getPrimaryLocations: () => primaryLocations,
        makeGlyphImage: (glyph) => glyph,
        onDashboardAction: (action) => pressed.push(action),
    });
    return {
        buttons: () => buttons,
        listeners,
        pressed,
        update(locations) {
            primaryLocations = locations;
            platform.updateDashboardButtons();
        },
    };
}

test('Dashboard Search uses a search icon and opens the app search flow', () => {
    const h = makeDashboard();
    assert.equal(h.buttons().length, 1);
    const [search] = h.buttons();
    assert.equal(search.image, 'search');
    assert.deepEqual(Array.from(search.titleVariants), ['Search']);
    assert.deepEqual(Array.from(search.subtitleVariants), []);
    assert.equal(search.launchHeadUnitScene, true);
    search.onPress();
    assert.deepEqual(h.pressed, ['search']);
});

test('Dashboard prefers Home and falls back to Work for its second shortcut', () => {
    for (const [locations, type, label, icon] of [
        [{ home: {}, work: {} }, 'home', 'Home', 'house'],
        [{ home: {} }, 'home', 'Home', 'house'],
        [{ work: {} }, 'work', 'Work', 'briefcase'],
    ]) {
        const h = makeDashboard(locations);
        assert.equal(h.buttons().length, 2);
        const button = h.buttons()[1];
        assert.equal(button.image, icon);
        assert.deepEqual(Array.from(button.titleVariants), [label]);
        assert.equal(button.launchHeadUnitScene, true);
        button.onPress();
        assert.deepEqual(h.pressed, [type]);
    }
});

test('Dashboard refreshes saved shortcuts and reapplies them on scene reconnect', () => {
    const h = makeDashboard({ home: {}, work: {} });
    h.update({ work: {} });
    assert.equal(h.buttons()[1].titleVariants[0], 'Work');
    h.listeners.didConnect();
    assert.equal(h.buttons()[1].titleVariants[0], 'Work');
    h.buttons()[1].onPress();
    assert.deepEqual(h.pressed, ['work']);
    h.update({});
    assert.equal(h.buttons().length, 1);
    h.update({ home: {} });
    assert.equal(h.buttons()[1].titleVariants[0], 'Home');
});

test('Dashboard actions wait for the root template and ignore disconnected sessions', async () => {
    const pressed = [];
    let finishPop;
    const context = vm.createContext({
        pendingDashboardAction: null,
        rootMapTemplate: null,
        rootMapTemplateIsReady: false,
        autoPlayConnectionGeneration: 1,
        loadAutoPlayModule: () => ({
            HybridAutoPlay: {
                popToRootTemplate: () =>
                    new Promise((resolve) => {
                        finishPop = resolve;
                    }),
            },
        }),
        handleRootHeaderSearchPress: () => pressed.push('search'),
        handleRootHeaderPrimaryLocationPress: (type) => pressed.push(type),
        logAutoPlayPlatformAction() {},
    });
    const start = autoPlaySource.indexOf(
        'function handleAutoPlayDashboardAction(',
    );
    assert.ok(start >= 0);
    vm.runInContext(
        autoPlaySource.slice(
            start,
            autoPlaySource.indexOf(
                'function handleRootHeaderPrimaryLocationPress(',
                start,
            ),
        ),
        context,
    );
    context.handleAutoPlayDashboardAction('search');
    assert.deepEqual(pressed, []);
    context.rootMapTemplate = {};
    context.rootMapTemplateIsReady = true;
    context.replayPendingDashboardAction();
    finishPop();
    await new Promise(setImmediate);
    assert.deepEqual(pressed, ['search']);
    context.handleAutoPlayDashboardAction('home');
    finishPop();
    await new Promise(setImmediate);
    assert.deepEqual(pressed, ['search', 'home']);
    context.handleAutoPlayDashboardAction('work');
    context.autoPlayConnectionGeneration += 1;
    finishPop();
    await new Promise(setImmediate);
    assert.deepEqual(pressed, ['search', 'home']);
});

test('Dashboard treats an already empty native template stack as a no-op and preserves real failures', async () => {
    let failure = new Error('No templates were available to be popped.');
    const context = vm.createContext({
        rootMapTemplateIsReady: true,
        loadAutoPlayModule: () => ({
            HybridAutoPlay: {
                popToRootTemplate: async () => {
                    throw failure;
                },
            },
        }),
    });
    const start = autoPlaySource.indexOf(
        'async function popToAutoPlayRootTemplate(',
    );
    vm.runInContext(
        autoPlaySource.slice(
            start,
            autoPlaySource.indexOf(
                'function replayPendingDashboardAction(',
                start,
            ),
        ),
        context,
    );
    await context.popToAutoPlayRootTemplate();
    context.rootMapTemplateIsReady = false;
    await assert.rejects(context.popToAutoPlayRootTemplate(), /No templates/);
    context.rootMapTemplateIsReady = true;
    failure = new Error('CarPlay disconnected');
    await assert.rejects(context.popToAutoPlayRootTemplate(), /disconnected/);
});

test('saved location changes and root readiness refresh Dashboard actions', () => {
    assert.match(
        autoPlaySource,
        /function applyAutoPlayPrimaryLocations\([\s\S]*?autoPlayPlatform\?\.updateDashboardButtons\?\.\(\)/,
    );
    assert.match(
        autoPlaySource,
        /registerPlatformListeners\(\{[\s\S]*?getPrimaryLocations: \(\) => autoPlayPrimaryLocations,[\s\S]*?onDashboardAction: handleAutoPlayDashboardAction,/,
    );
    assert.match(
        autoPlaySource,
        /rootMapTemplateIsReady = true;[\s\S]*?replayPendingDashboardAction\(\)/,
    );
    assert.match(
        autoPlaySource,
        /function handleAutoPlayDisconnect\(\)[\s\S]*?pendingDashboardAction = null;/,
    );
});

test('CarPlay Dashboard mounts its map only while its pane is visible', () => {
    assert.match(
        iosPlatformSource,
        /CarPlayDashboard\.setComponent\(CarPlayDashboardSurface\)/,
    );
    assert.match(
        dashboardSurfaceSource,
        /CarPlayDashboard\.addListenerRenderState\(\(state\) => \{[\s\S]*?state === 'didAppear'[\s\S]*?setIsVisible\(true\)[\s\S]*?state === 'didDisappear'[\s\S]*?setIsVisible\(false\)/,
    );
    assert.match(
        dashboardSurfaceSource,
        /isVisible \? \([\s\S]*?<CarPlayMapSurface[\s\S]*?\{\.\.\.props\}[\s\S]*?colorScheme=\{colorScheme\}/,
    );
});

test('CarPlay Dashboard leaves navigation chrome to the host', () => {
    assert.doesNotMatch(dashboardSurfaceSource, /showDrivingStatus/);
    assert.doesNotMatch(
        dashboardSurfaceSource,
        /carplay-dashboard-status-card/,
    );
    assert.doesNotMatch(dashboardSurfaceSource, /Ready to navigate/);
    // The Dashboard mounts the head-unit surface, so the only thing keeping its
    // driving status off is the module id the host hands the secondary scene.
    assert.match(
        autoPlayMapSurfaceContentSource,
        /const isRootMapSurface = !id \|\| id === AUTO_PLAY_ROOT_MODULE_ID/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /locationUpdatesEnabled: isRootMapSurface/,
    );
    assert.match(autoPlayMapSurfaceSource, /platformConfig=\{platformConfig\}/);
    assert.match(iosPlatformSource, /titleVariants: \['Search'\]/);
    assert.doesNotMatch(iosPlatformSource, /Find a destination|Open map/);
});

test('CarPlay Dashboard keeps the speed badge while the host draws the rest', () => {
    assert.match(
        autoPlayMapSurfaceContentSource,
        /const AUTO_PLAY_CARPLAY_DASHBOARD_MODULE_ID = 'CarPlayDashboard';/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /const isDashboardMapSurface = id === AUTO_PLAY_CARPLAY_DASHBOARD_MODULE_ID;[\s\S]*?getAutoPlayDrivingStatusVisibility\(\{\s*isDashboardMapSurface,\s*isRootMapSurface,\s*\}\)/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /const speedLimitIsRendered = getAutoPlaySpeedLimitVisibility\(\{\s*hostOwnsNavigationUI,\s*rendersSpeedLimit,\s*searchResultsMapIsActive:\s*rendersDrivingStatus && searchResultsMapIsActive,\s*\}\)/,
    );
    // The Dashboard has no location watch of its own, so free-drive limits
    // follow the shared road-matched location instead of the controller flag.
    assert.match(
        autoPlayMapSurfaceContentSource,
        /const freeDriveIsActive = isRoadMatchedLocationUpdate\(\s*mapPreferences\.userLocation,?\s*\)/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /<AutoPlayMapStatusOverlay[\s\S]*?freeDriveIsActive=\{freeDriveIsActive\}[\s\S]*?rendersSpeedLimit=\{speedLimitIsRendered\}/,
    );
    // The badge must not ride on the chrome flag the Dashboard turns off.
    assert.match(
        mapStatusOverlaySource,
        /const speedLimitIsRendered = Boolean\(rendersSpeedLimit\);/,
    );
    assert.doesNotMatch(
        mapStatusOverlaySource,
        /statusChromeIsVisible && rendersSpeedLimit/,
    );
});

test('CarPlay Dashboard keeps the current road pill independently of other status chrome', () => {
    assert.match(
        autoPlayMapSurfaceContentSource,
        /currentRoadPillIsVisible=\{\s*\(rendersAppOverlays \|\|\s*isClusterMapSurface \|\|\s*isDashboardMapSurface\) &&\s*!searchResultsMapIsActive/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /statusChromeIsVisible=\{\s*rendersAppOverlays && !searchResultsMapIsActive/,
    );
});

// Regression: the head-unit surface once set `hostOwnsNavigationUI`, which
// suppressed the whole app overlay layer on CarPlay. That took the current road
// pill, the speed limit badge and the navigation alert banner with it, and
// dropped the measured follow anchor so the puck sat dead centre.
test('CarPlay head-unit surface keeps the app overlays the host does not draw', () => {
    assert.doesNotMatch(carPlayMapSurfaceSource, /^\s*hostOwnsNavigationUI:/m);
    assert.match(carPlayMapSurfaceSource, /currentRoadPill: \{/);
});

test('CarPlay Dashboard uses the Mapbox release with its active-scene renderer fix', () => {
    assert.match(appConfigSource, /RNMapboxMapsVersion: '11\.24\.1'/);
    assert.match(
        mapLocationPuckPodspecSource,
        /dependency 'MapboxMaps', '= 11\.24\.1'/,
    );
    assert.match(mapLocationPuckAndroidBuildSource, /'11\.24\.1'/);
});

test('CarPlay removes the idle Car action but retains navigation exit support', () => {
    assert.doesNotMatch(iosPlatformSource, /usesHeaderDrivingModeButton/);
    assert.match(iosPlatformSource, /usesHeaderExitNavigationButton:\s*true/);
});
