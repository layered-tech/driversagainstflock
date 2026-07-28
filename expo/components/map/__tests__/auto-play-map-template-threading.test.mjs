import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const iosHybridMapTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/hybrid/HybridMapTemplate.swift',
        import.meta.url,
    ),
    'utf8',
);
const androidHybridMapTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridMapTemplate.kt',
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

test('CarPlay runs synchronous navigation mutations on the main thread', () => {
    assert.match(
        iosHybridMapTemplateSource,
        /withMapTemplateOnMainThread[\s\S]*?Thread\.isMainThread[\s\S]*?DispatchQueue\.main\.sync\(execute: operation\)/,
    );

    for (const method of [
        'updateVisibleTravelEstimate',
        'updateTravelEstimates',
        'updateManeuvers',
        'startNavigation',
        'stopNavigation',
        'setManeuverState',
    ]) {
        assert.match(
            iosHybridMapTemplateSource,
            new RegExp(
                `func ${method}\\([\\s\\S]*?try withMapTemplateOnMainThread\\(`,
            ),
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

test('the tracked dependency patch preserves both platform thread hops', () => {
    assert.match(autoPlayPatch, /ios\/hybrid\/HybridMapTemplate\.swift/);
    assert.match(
        autoPlayPatch,
        /DispatchQueue\.main\.sync\(execute: operation\)/,
    );
    assert.match(autoPlayPatch, /android\/.*\/HybridMapTemplate\.kt/);
    assert.match(autoPlayPatch, /UiThreadUtil\.runOnUiThread/);
});
