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
const iosHybridMapTemplateSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/hybrid/HybridMapTemplate.swift'),
    'utf8',
);
const iosRootModuleSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/utils/RootModule.swift'),
    'utf8',
);
const androidHybridMapTemplateSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridMapTemplate.kt',
    ),
    'utf8',
);

test('CarPlay isolates every synchronous map-template mutation on the main actor', () => {
    assert.match(
        iosRootModuleSource,
        /performOnMainActor<Result>[\s\S]*?MainActor\.assumeIsolated[\s\S]*?DispatchQueue\.main\.sync/,
    );
    assert.match(
        iosHybridMapTemplateSource,
        /func createMapTemplate[\s\S]*?try RootModule\.performOnMainActor/,
    );
    assert.match(
        iosHybridMapTemplateSource,
        /func setTemplateMapButtons[\s\S]*?MainActor\.run/,
    );

    for (const method of [
        'showNavigationAlert',
        'updateNavigationAlert',
        'dismissNavigationAlert',
        'showTripSelector',
        'hideTripSelector',
        'updateVisibleTravelEstimate',
        'updateTravelEstimates',
        'updateManeuvers',
        'registerManeuvers',
        'startNavigation',
        'stopNavigation',
        'setManeuverState',
    ]) {
        assert.match(
            iosHybridMapTemplateSource,
            new RegExp(`func ${method}\\([\\s\\S]*?withMapTemplateOnMainActor`),
        );
    }
});

test('Android Auto posts synchronous navigation mutations to the UI thread', () => {
    for (const method of [
        'updateVisibleTravelEstimate',
        'updateTravelEstimates',
        'updateManeuvers',
        'startNavigation',
        'stopNavigation',
    ]) {
        assert.match(
            androidHybridMapTemplateSource,
            new RegExp(
                `override fun ${method}\\([\\s\\S]*?UiThreadUtil\\.runOnUiThread`,
            ),
        );
    }
});

test('Android Auto implements the shared navigation-session API', () => {
    assert.match(
        androidHybridMapTemplateSource,
        /override fun registerManeuvers\([\s\S]*?maneuvers: Array<NitroRoutingManeuver>[\s\S]*?Android Auto receives the current and next maneuver through updateManeuvers/,
    );
    assert.match(
        androidHybridMapTemplateSource,
        /override fun stopNavigation\([\s\S]*?reason: NavigationStopReason[\s\S]*?UiThreadUtil\.runOnUiThread[\s\S]*?MapTemplate\.stopNavigation\(\)/,
    );
});
