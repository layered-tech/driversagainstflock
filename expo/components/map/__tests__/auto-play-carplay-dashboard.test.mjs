import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
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
const dashboardSceneSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/scenes/DashboardSceneDelegate.swift'),
    'utf8',
);

test('CarPlay reapplies Dashboard shortcuts after its scene connects', () => {
    assert.match(
        iosPlatformSource,
        /applyDashboardButtons\(CarPlayDashboard, makeGlyphImage\);[\s\S]*?CarPlayDashboard\.addListener\('didConnect',[\s\S]*?applyDashboardButtons\(CarPlayDashboard, makeGlyphImage\)/,
    );
});

test('CarPlay consumes Dashboard Nitro promises without hiding failures', () => {
    assert.match(
        iosPlatformSource,
        /return CarPlayDashboard\.setButtons\(\[[\s\S]*?\]\)\.catch\(\(error\) => \{[\s\S]*?console\.warn\([\s\S]*?error/,
    );
    assert.doesNotMatch(
        iosPlatformSource,
        /Promise\.resolve\(\s*CarPlayDashboard\.setButtons/,
    );

    // The fork's JS Dashboard wrapper must hand the Nitro promise back rather
    // than swallowing it, otherwise the `.catch` above never sees a failure.
    const dashboardSceneSources = [
        'src/scenes/CarPlayDashboardScene.ts',
        'lib/scenes/CarPlayDashboardScene.js',
    ].map((file) => readFileSync(join(autoPlayPackageRoot, file), 'utf8'));
    for (const source of dashboardSceneSources) {
        assert.match(
            source,
            /setButtons\(buttons[^{]*\{[\s\S]*?return Promise\.resolve\(\);[\s\S]*?return HybridCarPlayDashboard\.setButtons\(/,
        );
        assert.match(
            source,
            /HybridCarPlayDashboard\.initRootView\(\)\.catch\(\(error\) => \{[\s\S]*?console\.warn\('CarPlayDashboard\.initRootView failed', error\)/,
        );
    }
    assert.match(
        readFileSync(
            join(autoPlayPackageRoot, 'lib/scenes/CarPlayDashboardScene.d.ts'),
            'utf8',
        ),
        /setButtons\(buttons: Array<CarPlayDashboardButton>\): Promise<void>;/,
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
    assert.match(iosPlatformSource, /titleVariants: \['Open map'\]/);
    assert.match(
        iosPlatformSource,
        /subtitleVariants: \['Find a destination'\]/,
    );
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
        /const freeDriveIsActive = isRootMapSurface\s*\? controller\.roadMatchedLocationWatchEnabled\s*: isRoadMatchedLocationUpdate\(mapPreferences\.userLocation\)/,
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

// Regression: the head-unit surface once set `hostOwnsNavigationUI`, which
// suppressed the whole app overlay layer on CarPlay. That took the current road
// pill, the speed limit badge and the navigation alert banner with it, and
// dropped the measured follow anchor so the puck sat dead centre.
test('CarPlay head-unit surface keeps the app overlays the host does not draw', () => {
    assert.doesNotMatch(carPlayMapSurfaceSource, /^\s*hostOwnsNavigationUI:/m);
    assert.match(carPlayMapSurfaceSource, /currentRoadPill: \{/);
});

test('CarPlay sizes the map to its Dashboard pane instead of the full display', () => {
    assert.match(
        dashboardSceneSource,
        /"height": window\.bounds\.size\.height\.rounded\(\),[\s\S]*?"width": window\.bounds\.size\.width\.rounded\(\)/,
    );
    assert.doesNotMatch(dashboardSceneSource, /window\.screen\.bounds/);
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
