import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const androidAutoScreenSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoScreen.kt',
        import.meta.url,
    ),
    'utf8',
);
const androidAutoTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/AndroidAutoTemplate.kt',
        import.meta.url,
    ),
    'utf8',
);
const hybridListTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridListTemplate.kt',
        import.meta.url,
    ),
    'utf8',
);
const hybridSearchTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridSearchTemplate.kt',
        import.meta.url,
    ),
    'utf8',
);
const listTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/ListTemplate.kt',
        import.meta.url,
    ),
    'utf8',
);
const searchTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/SearchTemplate.kt',
        import.meta.url,
    ),
    'utf8',
);

test('only changed Android Auto chrome reaches the native template', () => {
    assert.match(autoPlaySource, /let lastAppliedMapButtonsKey = null/);
    assert.match(autoPlaySource, /let lastAppliedHeaderActionsKey = null/);
    assert.match(
        autoPlaySource,
        /mapButtonsKey !== lastAppliedMapButtonsKey[\s\S]*?setMapButtons\(mapButtons\)/,
    );
    assert.match(
        autoPlaySource,
        /headerActionsKey !== lastAppliedHeaderActionsKey[\s\S]*?setHeaderActions\(headerActions\)/,
    );
    assert.match(
        autoPlaySource,
        /setMapButtons\(mapButtons\)\.catch\([\s\S]*?lastAppliedMapButtonsKey = null/,
    );
    assert.match(
        autoPlaySource,
        /setHeaderActions\(headerActions\)\.catch\([\s\S]*?lastAppliedHeaderActionsKey = null/,
    );
    assert.match(
        autoPlaySource,
        /rootMapTemplateIsReady = false;[\s\S]*?lastAppliedMapButtonsKey = null[\s\S]*?lastAppliedHeaderActionsKey = null/,
    );
    assert.match(
        autoPlaySource,
        /const initialRootMapHeaderActions = getRootMapHeaderActions\(\);[\s\S]*?lastAppliedHeaderActionsKey = getTemplateChromeKey\([\s\S]*?initialRootMapHeaderActions/,
    );
});

test('Android Auto rate-limits and cancels deferred template invalidations', () => {
    assert.match(
        androidAutoScreenSource,
        /private const val MIN_INVALIDATION_INTERVAL_MS = 250L/,
    );
    assert.match(
        androidAutoScreenSource,
        /invalidationHandler\.postDelayed\(invalidationRunnable, delayMs\)/,
    );
    assert.match(
        androidAutoScreenSource,
        /Lifecycle\.Event\.ON_DESTROY -> \{[\s\S]*?invalidationHandler\.removeCallbacks\(invalidationRunnable\)/,
    );
});

test('final Android Auto search updates execute on the UI thread', () => {
    assert.match(
        hybridSearchTemplateSource,
        /override fun updateSearchResults[\s\S]*?return Promise\.async \{[\s\S]*?val result = ThreadUtil\.postOnUiAndAwait \{[\s\S]*?template\.updateSearchResults\(results\)[\s\S]*?if \(result\.isFailure\) \{[\s\S]*?throw result\.exceptionOrNull\(\)/,
    );
});

test('final Android Auto list updates execute on the UI thread', () => {
    assert.match(
        hybridListTemplateSource,
        /override fun updateListTemplateSections[\s\S]*?return Promise\.async \{[\s\S]*?val result = ThreadUtil\.postOnUiAndAwait \{[\s\S]*?template\.updateSections\(sections\)[\s\S]*?if \(result\.isFailure\) \{[\s\S]*?throw result\.exceptionOrNull\(\)/,
    );
});

test('Android Auto template updates avoid default arguments in super calls', () => {
    assert.match(
        androidAutoTemplateSource,
        /fun applyConfigUpdate\(\) \{[\s\S]*?applyConfigUpdate\(immediate = false\)[\s\S]*?fun applyConfigUpdate\(immediate: Boolean\)/,
    );
    assert.doesNotMatch(
        androidAutoTemplateSource,
        /fun applyConfigUpdate\(immediate: Boolean = false\)/,
    );
});

function getApplyConfigUpdateSource() {
    const applyConfigUpdateStart = androidAutoScreenSource.indexOf(
        'fun applyConfigUpdate(',
    );
    const applyConfigUpdateEnd = androidAutoScreenSource.indexOf(
        'override fun onGetTemplate()',
        applyConfigUpdateStart,
    );
    const applyConfigUpdateSource = androidAutoScreenSource.slice(
        applyConfigUpdateStart,
        applyConfigUpdateEnd,
    );

    assert.notEqual(applyConfigUpdateStart, -1);
    assert.notEqual(applyConfigUpdateEnd, -1);

    return applyConfigUpdateSource;
}

function assertImmediateInvalidationPath(applyConfigUpdateSource) {
    assert.match(applyConfigUpdateSource, /immediate: Boolean = false/);
    assert.match(
        applyConfigUpdateSource,
        /if \(immediate\) \{[\s\S]*?invalidationHandler\.removeCallbacks\(invalidationRunnable\)[\s\S]*?invalidationPending\.set\(false\)[\s\S]*?invalidate\(\)[\s\S]*?return/,
    );
    assert.match(
        applyConfigUpdateSource,
        /if \(immediate\)[\s\S]*?return[\s\S]*?scheduleInvalidation\(\)/,
    );
}

test('final Android Auto search results invalidate immediately', () => {
    assert.match(
        searchTemplateSource,
        /fun updateSearchResults[\s\S]*?config = config\.copy\(results = results\)[\s\S]*?super\.applyConfigUpdate\(immediate = true\)/,
    );

    assertImmediateInvalidationPath(getApplyConfigUpdateSource());
});

test('final Android Auto list sections invalidate immediately', () => {
    assert.match(
        listTemplateSource,
        /fun updateSections[\s\S]*?config = config\.copy\(sections = sections\)[\s\S]*?super\.applyConfigUpdate\(immediate = true\)/,
    );

    assertImmediateInvalidationPath(getApplyConfigUpdateSource());
});
