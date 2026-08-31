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
const autoPlayAppSource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function readAutoPlaySource(path) {
    return readFileSync(join(autoPlayPackageRoot, path), 'utf8');
}

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.notEqual(start, -1, `Missing source token: ${startToken}`);
    assert.notEqual(end, -1, `Missing source token: ${endToken}`);

    return source.slice(start, end);
}

const hybridMapTemplateSource = readAutoPlaySource(
    'ios/hybrid/HybridMapTemplate.swift',
);
const mapTemplateSource = readAutoPlaySource('ios/templates/MapTemplate.swift');
const sceneStoreSource = readAutoPlaySource('ios/scenes/SceneStore.swift');
const autoPlaySceneSource = readAutoPlaySource(
    'ios/scenes/AutoPlayScene.swift',
);
const mapTemplateSpecSource = readAutoPlaySource(
    'src/specs/MapTemplate.nitro.ts',
);
const mapTemplateWrapperSource = readAutoPlaySource(
    'src/templates/MapTemplate.ts',
);

test('CarPlay preserves visible maneuver order and registers the full route separately', () => {
    assert.match(
        mapTemplateSpecSource,
        /registerManeuvers\(templateId: string, maneuvers: Array<NitroRoutingManeuver>\): void/,
    );
    assert.match(
        mapTemplateWrapperSource,
        /public registerManeuvers\(maneuvers: Array<RoutingManeuver>\)[\s\S]*?HybridMapTemplate\.registerManeuvers/,
    );
    assert.match(
        mapTemplateSource,
        /func registerManeuvers\(maneuvers: \[NitroRoutingManeuver\]\)[\s\S]*?navigationSession\.add\(newlyRegisteredManeuvers\)/,
    );
    assert.match(
        mapTemplateSource,
        /var upcomingManeuvers = maneuvers\.map[\s\S]*?return maneuver[\s\S]*?navigationSession\.upcomingManeuvers = upcomingManeuvers/,
    );
    assert.doesNotMatch(mapTemplateSource, /if index != maneuverIndex/);
    assert.match(
        autoPlayAppSource,
        /function makeAutoPlayRegisteredManeuvers[\s\S]*?routeOption\?\.maneuvers[\s\S]*?makeAutoPlayRoutingManeuver/,
    );
    assert.match(
        autoPlayAppSource,
        /rootMapTemplate\.registerManeuvers\?\.\([\s\S]*?makeAutoPlayRegisteredManeuvers\(route\)/,
    );
});

test('CarPlay distinguishes arrival from cancellation', () => {
    assert.match(
        mapTemplateWrapperSource,
        /enum NavigationStopReason[\s\S]*?Arrived = 0[\s\S]*?Cancelled = 1/,
    );
    assert.match(
        mapTemplateWrapperSource,
        /stopNavigation\(reason = NavigationStopReason\.Cancelled\)[\s\S]*?HybridMapTemplate\.stopNavigation\(this\.id, reason\)/,
    );
    assert.match(
        hybridMapTemplateSource,
        /func stopNavigation\([\s\S]*?reason: NavigationStopReason[\s\S]*?template\.stopNavigation\(reason: reason\)/,
    );
    assert.match(
        mapTemplateSource,
        /func stopNavigation\(reason: NavigationStopReason = \.cancelled\)[\s\S]*?case \.arrived:[\s\S]*?finishTrip\(\)[\s\S]*?case \.cancelled:[\s\S]*?cancelTrip\(\)/,
    );
    assert.match(
        mapTemplateSource,
        /mapTemplateDidCancelNavigation[\s\S]*?stopNavigation\(reason: \.cancelled\)[\s\S]*?config\.onStopNavigation\(\)/,
    );
    assert.match(
        autoPlayAppSource,
        /navigationStopReason === 'arrived'[\s\S]*?NavigationStopReason\?\.Arrived[\s\S]*?NavigationStopReason\?\.Cancelled[\s\S]*?rootMapTemplate\.stopNavigation\(nativeStopReason\)/,
    );
    assert.equal(
        autoPlayAppSource.match(/navigationStopReason:\s*'arrived'/g)?.length,
        2,
    );
});

test('navigation setup failures cancel any native session that may have started', () => {
    const cancelNativeNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function cancelNativeAutoPlayNavigation(',
        'async function stopAutoPlayNavigation(',
    );
    const startNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function startAutoPlayNavigation(',
        'function handleRootHeaderPrimaryLocationPress(',
    );

    assert.match(
        cancelNativeNavigationSource,
        /mapTemplate\.stopNavigation\(NavigationStopReason\?\.Cancelled \?\? 1\)/,
    );
    assert.match(
        startNavigationSource,
        /let nativeNavigationMayBeActive = hostNavigationAlreadyStarted/,
    );
    assert.match(
        startNavigationSource,
        /const tripConfig = makeTripConfig\(route\);\s*nativeNavigationMayBeActive = true;\s*rootMapTemplate\.startNavigation\(tripConfig\)/,
    );
    assert.match(
        startNavigationSource,
        /catch \(error\) \{[\s\S]*?if \(nativeNavigationMayBeActive\) \{\s*cancelNativeAutoPlayNavigation\(rootMapTemplate\);\s*\}/,
    );
    assert.match(
        startNavigationSource,
        /stopAutoPlayNavigation\(\{\s*notifyTemplate: false,\s*publishSharedState,\s*\}\)[\s\S]*?showAutoPlayError/,
    );
});

test('CarPlay removes stale render state with its scene', () => {
    assert.match(
        sceneStoreSource,
        /removeScene\(moduleName: String\)[\s\S]*?renderState\.removeValue\(forKey: moduleName\)[\s\S]*?store\.removeValue\(forKey: moduleName\)/,
    );
});

test('CarPlay reconnects the same scene with fresh connection properties', () => {
    const connectSource = sourceBetween(
        autoPlaySceneSource,
        'func connect(props: [String: Any])',
        'func disconnect()',
    );

    assert.match(
        connectSource,
        /SceneStore\.addScene\(moduleName: moduleName, scene: self\)[\s\S]*?isConnected = true/,
    );
    assert.match(
        connectSource,
        /initialProperties = initialProperties\.merging\(props\) \{ _, incoming in[\s\S]*?incoming/,
    );
});

test('CarPlay clears stale road guidance for non-routing maneuver states', () => {
    const loadingSource = sourceBetween(
        mapTemplateSource,
        'func updateManeuversLoading',
        'func updateManeuvers(messageManeuver',
    );
    const messageSource = sourceBetween(
        mapTemplateSource,
        'func updateManeuvers(messageManeuver',
        'func registerManeuvers',
    );
    const routingSource = sourceBetween(
        mapTemplateSource,
        'func updateManeuvers(maneuvers:',
        'func startNavigation',
    );

    assert.match(loadingSource, /currentRoadNameVariants = \[\]/);
    assert.match(messageSource, /currentRoadNameVariants = \[\]/);
    assert.match(
        routingSource,
        /if maneuvers\.isEmpty \{[\s\S]*?currentRoadNameVariants = \[\][\s\S]*?return/,
    );
    assert.match(
        routingSource,
        /navigationSession\.currentRoadNameVariants =\s*upcomingManeuvers\.first\?\.roadFollowingManeuverVariants \?\? \[\]/,
    );
});
