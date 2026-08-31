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

test('CarPlay head-unit and Dashboard surfaces leave navigation chrome to the host', () => {
    assert.match(carPlayMapSurfaceSource, /hostOwnsNavigationUI:\s*true/);
    assert.doesNotMatch(dashboardSurfaceSource, /showDrivingStatus/);
    assert.doesNotMatch(
        dashboardSurfaceSource,
        /carplay-dashboard-status-card/,
    );
    assert.doesNotMatch(dashboardSurfaceSource, /Ready to navigate/);
    assert.match(autoPlayMapSurfaceContentSource, /hostOwnsNavigationUI/);
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
