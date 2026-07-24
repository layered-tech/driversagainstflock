import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
const mapTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/MapTemplate.swift',
        import.meta.url,
    ),
    'utf8',
);
const dashboardSceneSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/scenes/DashboardSceneDelegate.swift',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayPatch = readFileSync(
    new URL(
        '../../../patches/@iternio+react-native-auto-play+0.4.7.patch',
        import.meta.url,
    ),
    'utf8',
);
const dashboardScenePatchStart = autoPlayPatch.indexOf(
    'diff --git a/node_modules/@iternio/react-native-auto-play/ios/scenes/DashboardSceneDelegate.swift',
);
const dashboardScenePatchEnd = autoPlayPatch.indexOf(
    '\ndiff --git ',
    dashboardScenePatchStart + 1,
);
const dashboardScenePatch = autoPlayPatch.slice(
    dashboardScenePatchStart,
    dashboardScenePatchEnd,
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

test('CarPlay Dashboard shows shared driving status instead of a navigation card', () => {
    assert.match(
        dashboardSurfaceSource,
        /<CarPlayMapSurface[\s\S]*?showDrivingStatus/,
    );
    assert.doesNotMatch(
        dashboardSurfaceSource,
        /carplay-dashboard-status-card/,
    );
    assert.doesNotMatch(dashboardSurfaceSource, /Ready to navigate/);
    assert.match(
        autoPlayMapSurfaceSource,
        /showDrivingStatus=\{props\?\.showDrivingStatus\}/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /const rendersDrivingStatus = isRootMapSurface \|\| showDrivingStatus/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /locationUpdatesEnabled: isRootMapSurface/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /routePreviewIsActive: rendersDrivingStatus && routePreviewIsActive/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /rendersDrivingStatus && !searchResultsMapIsActive[\s\S]*?<AutoPlayMapStatusOverlay/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /freeDriveIsActive=\{[\s\S]*?controller\.roadMatchedLocationWatchEnabled \|\|[\s\S]*?showDrivingStatus/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /rendersDrivingStatus \? \([\s\S]*?<AutoPlayTopRightStatusOverlay/,
    );
    assert.match(
        autoPlayMapSurfaceContentSource,
        /enabled:[\s\S]*?rendersDrivingStatus[\s\S]*?useUpcomingElectronicHorizonAlerts/,
    );
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
    assert.match(
        dashboardScenePatch,
        /-                "height": window\.screen\.bounds\.size\.height\.rounded\(\),[\s\S]*?\+                "height": window\.bounds\.size\.height\.rounded\(\),[\s\S]*?\+                "width": window\.bounds\.size\.width\.rounded\(\)/,
    );
});

test('CarPlay Dashboard uses the Mapbox release with its active-scene renderer fix', () => {
    assert.match(appConfigSource, /RNMapboxMapsVersion: '11\.24\.1'/);
    assert.match(
        mapLocationPuckPodspecSource,
        /dependency 'MapboxMaps', '= 11\.24\.1'/,
    );
    assert.match(mapLocationPuckAndroidBuildSource, /'11\.24\.1'/);
});

test('CarPlay refreshes the active maneuver estimate after publishing maneuvers', () => {
    for (const source of [mapTemplateSource, autoPlayPatch]) {
        assert.match(source, /for: sessionManeuvers\[maneuverIndex\]/);
        assert.match(
            source,
            /navigationSession\.upcomingManeuvers = upcomingManeuvers[\s\S]*?let currentManeuver = navigationSession\.upcomingManeuvers\.first[\s\S]*?navigationSession\.updateEstimates\([\s\S]*?for: currentManeuver/,
        );
    }
});

test('CarPlay removes the idle Car action but retains navigation exit support', () => {
    assert.match(iosPlatformSource, /usesHeaderDrivingModeButton:\s*false/);
    assert.match(iosPlatformSource, /usesHeaderExitNavigationButton:\s*true/);
});
