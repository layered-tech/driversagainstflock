import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const androidPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
    'utf8',
);
const sentrySource = readFileSync(
    new URL('../../../lib/sentry.js', import.meta.url),
    'utf8',
);
const androidAutoSessionSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoSession.kt',
        import.meta.url,
    ),
    'utf8',
);
const hybridAutoPlaySource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridAutoPlay.kt',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayNitroSpecSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/src/specs/AutoPlay.nitro.ts',
        import.meta.url,
    ),
    'utf8',
);
const generatedAutoPlaySpecSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/nitrogen/generated/android/kotlin/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridAutoPlaySpec.kt',
        import.meta.url,
    ),
    'utf8',
);
const androidAutoManifestSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/AndroidManifest.xml',
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
const androidSearchTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/SearchTemplate.kt',
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

test('Android Auto handles voice navigation on initial and later session intents', () => {
    assert.match(
        androidAutoSessionSource,
        /override fun onCreateScreen\(intent: Intent\)[\s\S]*?HybridAutoPlay\.emit\(EventName\.DIDCONNECT\)[\s\S]*?handleNavigationIntent\(intent\)/,
    );
    assert.match(
        androidAutoSessionSource,
        /override fun onNewIntent\(intent: Intent\) \{\s*super\.onNewIntent\(intent\)\s*handleNavigationIntent\(intent\)\s*\}/,
    );
});

test('Android Auto advertises distinct geo search and navigation actions', () => {
    assert.match(
        androidAutoManifestSource,
        /<action android:name="androidx\.car\.app\.action\.NAVIGATE" \/>[\s\S]*?<data android:scheme="geo" \/>/,
    );
    assert.match(
        androidAutoManifestSource,
        /<action android:name="android\.intent\.action\.VIEW" \/>[\s\S]*?<data android:scheme="geo" \/>/,
    );
});

test('Android Auto parses only opaque geo search or navigation intents', () => {
    assert.match(
        androidAutoSessionSource,
        /val isSearchRequest = intent\.action == Intent\.ACTION_VIEW[\s\S]*?!isSearchRequest && intent\.action != CarContext\.ACTION_NAVIGATE/,
    );
    assert.match(
        androidAutoSessionSource,
        /data\.scheme\.equals\("geo", ignoreCase = true\)[\s\S]*?if \(schemeClass != NavigationSchemeClass\.GEO\)/,
    );
    assert.match(
        androidAutoSessionSource,
        /if \(!data\.isOpaque\)[\s\S]*?NON_OPAQUE_GEO_URI/,
    );
    assert.match(
        androidAutoSessionSource,
        /parseNavigationCoordinates\([\s\S]*?substringBefore\('\?'\)[\s\S]*?parseNavigationParameters\([\s\S]*?substringAfter\('\?', ""\)/,
    );
    assert.match(
        androidAutoSessionSource,
        /parseNavigationParameters\([\s\S]*?if \(schemeClass != NavigationSchemeClass\.GEO\)[\s\S]*?coordinates\.state,[\s\S]*?parameters\.queryPresent,[\s\S]*?parameters\.intentClass/,
    );
    assert.match(
        androidAutoSessionSource,
        /encodedQuery\.split\('&'\)[\s\S]*?URLDecoder\.decode\(encodedKey[\s\S]*?decodedKey != "q" && decodedKey != "intent"/,
    );
    assert.doesNotMatch(
        androidAutoSessionSource,
        /indexOf\("\?q="\)|getQueryParameter/,
    );
});

test('Android Auto accepts bounded coordinates for supported intent classes', () => {
    assert.match(
        androidAutoSessionSource,
        /!lat\.isFinite\(\) \|\| !lon\.isFinite\(\)/,
    );
    assert.match(
        androidAutoSessionSource,
        /lat !in -90\.0\.\.90\.0 \|\| lon !in -180\.0\.\.180\.0/,
    );
    assert.match(
        androidAutoSessionSource,
        /lat == 0\.0 && lon == 0\.0[\s\S]*?NavigationCoordinateState\.ZERO/,
    );
    assert.match(
        androidAutoSessionSource,
        /when \(parameters\.intentClass\)[\s\S]*?NavigationIntentClass\.ADD_A_STOP[\s\S]*?return[\s\S]*?NavigationIntentClass\.UNSUPPORTED[\s\S]*?return[\s\S]*?val requestType = when[\s\S]*?NavigationRequestType\.SEARCH[\s\S]*?NavigationRequestType\.DIRECTIONS[\s\S]*?NavigationRequestType\.QUERY[\s\S]*?NavigationRequestType\.NAVIGATION[\s\S]*?if \(coordinates\.state == NavigationCoordinateState\.VALID\)[\s\S]*?HybridAutoPlay\.emitVoiceInput\(\s*coordinates\.location,\s*parameters\.query,\s*requestType\.bridgeValue/,
    );
});

test('Android Auto marks lossy text-only navigation actions as queries', () => {
    assert.match(
        androidAutoSessionSource,
        /intentValues\.isEmpty\(\) -> NavigationIntentClass\.NAVIGATION[\s\S]*?"navigation" -> NavigationIntentClass\.NAVIGATION[\s\S]*?"directions" -> NavigationIntentClass\.DIRECTIONS/,
    );
    assert.match(
        androidAutoSessionSource,
        /coordinates\.state == NavigationCoordinateState\.ZERO &&[\s\S]*?parameters\.query != null &&[\s\S]*?!parameters\.intentPresent -> NavigationRequestType\.QUERY/,
    );
    assert.match(
        androidAutoSessionSource,
        /val intentPresent = hasEncodedNavigationParameter\(encodedQuery, "intent"\)[\s\S]*?intentPresent = intentPresent/,
    );
    assert.match(
        androidAutoSessionSource,
        /coordinates\.state == NavigationCoordinateState\.ZERO &&[\s\S]*?parameters\.query != null &&[\s\S]*?NavigationIntentClass\.NAVIGATION \|\|[\s\S]*?NavigationIntentClass\.DIRECTIONS[\s\S]*?HybridAutoPlay\.emitVoiceInput\(\s*null,\s*parameters\.query,\s*requestType\.bridgeValue/,
    );
    assert.doesNotMatch(
        androidAutoSessionSource,
        /QUERY_REQUIRES_EXPLICIT_INTENT|query_requires_explicit_intent/,
    );
});

test('Android Auto rejects unsupported and ambiguous navigation intent metadata', () => {
    assert.match(
        androidAutoSessionSource,
        /"add_a_stop" -> NavigationIntentClass\.ADD_A_STOP[\s\S]*?else -> NavigationIntentClass\.UNSUPPORTED/,
    );
    assert.match(
        androidAutoSessionSource,
        /NavigationIntentClass\.ADD_A_STOP ->[\s\S]*?UNSUPPORTED_ADD_STOP[\s\S]*?return/,
    );
    assert.match(
        androidAutoSessionSource,
        /NavigationIntentClass\.UNSUPPORTED ->[\s\S]*?UNSUPPORTED_INTENT[\s\S]*?return/,
    );
    assert.match(
        androidAutoSessionSource,
        /queryValues\.size > 1[\s\S]*?DUPLICATE_QUERY[\s\S]*?intentValues\.size > 1[\s\S]*?DUPLICATE_INTENT/,
    );
});

test('Android Auto rejection logs contain metadata only', () => {
    assert.match(
        androidAutoSessionSource,
        /"Rejected navigation intent " \+[\s\S]*?"reason=\$\{reason\.logValue\} " \+[\s\S]*?"scheme=\$\{schemeClass\.logValue\} " \+[\s\S]*?"coordinateState=\$\{coordinateState\.logValue\} " \+[\s\S]*?"queryPresent=\$queryPresent " \+[\s\S]*?"intentClass=\$\{intentClass\.logValue\}"/,
    );
    assert.doesNotMatch(
        androidAutoSessionSource,
        /Failed to parse navigation intent|Log\.[ew]\([^\n]*(encodedSchemeSpecificPart|parameters\.query|intent\.data|\.message)/,
    );
    assert.match(
        androidAutoSessionSource,
        /"Accepted voice intent " \+[\s\S]*?"requestType=\$\{requestType\.bridgeValue\} " \+[\s\S]*?"coordinateState=\$\{coordinateState\.logValue\} " \+[\s\S]*?"queryPresent=\$queryPresent " \+[\s\S]*?"intentClass=\$\{intentClass\.logValue\}"/,
    );
});

test('Android Auto replays an initial voice intent after JS subscribes', () => {
    assert.match(
        hybridAutoPlaySource,
        /addListenerVoiceInput[\s\S]*?synchronized\(voiceInputLock\)[\s\S]*?pendingVoiceInput\?\.let[\s\S]*?callback\(it\.first, it\.second, it\.third\)[\s\S]*?return/,
    );
    assert.match(
        hybridAutoPlaySource,
        /fun emitVoiceInput[\s\S]*?requestType: String[\s\S]*?voiceInputListeners\.isEmpty\(\)[\s\S]*?pendingVoiceInput = Triple\(location, query, requestType\)[\s\S]*?voiceInputListeners\.toList\(\)/,
    );
});

test('the native bridge preserves search, navigation, and directions mode', () => {
    assert.match(
        autoPlayNitroSpecSource,
        /addListenerVoiceInput\([\s\S]*?requestType: string/,
    );
    assert.match(
        generatedAutoPlaySpecSource,
        /addListenerVoiceInput\(callback: \(coordinates: Location\?, query: String\?, requestType: String\) -> Unit\)/,
    );
    assert.match(
        hybridAutoPlaySource,
        /listeners\.forEach \{\s*it\(location, query, requestType\)\s*\}/,
    );
});

test('Android Auto drops an unreplayed voice intent with its root session', () => {
    assert.match(
        hybridAutoPlaySource,
        /fun clearPendingVoiceInput\(\)[\s\S]*?synchronized\(voiceInputLock\)[\s\S]*?pendingVoiceInput = null/,
    );
    assert.match(
        androidAutoSessionSource,
        /clusterId\?\.let[\s\S]*?return[\s\S]*?HybridAutoPlay\.clearPendingVoiceInput\(\)[\s\S]*?HybridAutoPlay\.emit\(EventName\.DIDDISCONNECT\)/,
    );
});

test('Android Auto rejects search-result publication after its template is gone', () => {
    assert.match(
        hybridSearchTemplateSource,
        /as\? SearchTemplate\s*\?: throw IllegalArgumentException\([\s\S]*?updateSearchResults failed, template \$templateId not found or not a SearchTemplate/,
    );
    assert.doesNotMatch(hybridSearchTemplateSource, /\?: return@async/);
});

test('Android Auto in-app voice search remains on the SearchTemplate callback', () => {
    assert.match(
        androidSearchTemplateSource,
        /SearchTemplate\.Builder\(object : SearchCallback[\s\S]*?override fun onSearchSubmitted\(searchText: String\)[\s\S]*?config\.onSearchTextSubmitted\(searchText\)/,
    );
    assert.doesNotMatch(androidSearchTemplateSource, /handleNavigationIntent/);
});

test('JS waits for the root map before consuming a replayed voice intent', () => {
    assert.match(
        autoPlaySource,
        /function getAutoPlayLocation[\s\S]*?longitude < -180[\s\S]*?longitude > 180/,
    );
    assert.match(
        autoPlaySource,
        /function handleVoiceNavigationWhenReady[\s\S]*?!rootMapTemplateIsReady[\s\S]*?pendingVoiceNavigation = \{[\s\S]*?coordinates,[\s\S]*?query,[\s\S]*?requestType/,
    );
    assert.match(
        autoPlaySource,
        /rootMapTemplateIsReady = true;[\s\S]*?replayPendingVoiceNavigation\(\)/,
    );
    assert.match(
        autoPlaySource,
        /onVoiceNavigation: handleVoiceNavigationWhenReady/,
    );
    assert.match(
        autoPlaySource,
        /function autoPlayVoiceRequestIsCurrent[\s\S]*?connectionGeneration === autoPlayConnectionGeneration[\s\S]*?requestGeneration === voiceNavigationRequestGeneration[\s\S]*?rootMapTemplateIsReady[\s\S]*?rootMapTemplate === mapTemplate/,
    );
    assert.match(
        autoPlaySource,
        /voiceSearchController = new AbortController\(\);[\s\S]*?searchAbortController = voiceSearchController[\s\S]*?const startLocation = await getLastKnownLocation\(\);[\s\S]*?autoPlaySearchRequestIsCurrent\([\s\S]*?voiceSearchController[\s\S]*?const results = await searchTextPlaces\(\{[\s\S]*?signal: voiceSearchController\.signal[\s\S]*?autoPlaySearchRequestIsCurrent\([\s\S]*?voiceSearchController/,
    );
    assert.match(
        autoPlaySource,
        /function handleVoiceNavigationWhenReady[\s\S]*?voiceNavigationRequestGeneration \+= 1[\s\S]*?cancelAutoPlaySearchWork\(\)[\s\S]*?handleVoiceNavigation\([\s\S]*?requestGeneration/,
    );
    assert.match(
        autoPlaySource,
        /async function stopAutoPlayNavigation[\s\S]*?cancelAutoPlaySearchWork\(\)[\s\S]*?stopAutoDriveSimulation\(\)/,
    );
});

test('JS shows search results and starts only navigation voice requests', () => {
    assert.match(
        autoPlaySource,
        /const resolvedRequestType = resolveAutoPlayVoiceRequestType\(\{\s*hasDestinationCoordinates: Boolean\(destinationLocation\),\s*requestType,\s*\}\);[\s\S]*?if \(resolvedRequestType === 'search'\) \{\s*pendingVoiceSearchTemplatePush = \{\s*\.\.\.openSearchTemplate\(searchQuery, destinationLocation, \{\s*autoAdvanceSingleResult: true,\s*requestIsCurrent,\s*\}\),\s*requestGeneration,\s*\};\s*return;/,
    );
    assert.doesNotMatch(autoPlaySource, /inferAutoPlayVoiceQueryRequestType/);
    assert.match(
        autoPlaySource,
        /function openSearchTemplate[\s\S]*?template\s*\.push\(\)\s*\.then\(\(\) => \{\s*templateWasPushed = true;[\s\S]*?if \(initialSearchText && requestIsCurrent\(\)\) \{\s*return runSubmittedSearch\(initialSearchText, \{\s*shouldAutoAdvanceSingleResult: autoAdvanceSingleResult,\s*\}\);/,
    );
    assert.match(
        autoPlaySource,
        /const runSubmittedSearch = \(\s*searchText,\s*\{ shouldAutoAdvanceSingleResult = false \} = \{\},\s*\) => \{\s*if \(!requestIsCurrent\(\)\) \{\s*return Promise\.resolve\(\);/,
    );
    assert.match(
        autoPlaySource,
        /onSearchTextChanged: \(searchText\) => \{\s*if \(!requestIsCurrent\(\)\) \{\s*return;/,
    );
    assert.match(
        autoPlaySource,
        /async function dismissSupersededVoiceSearchTemplate[\s\S]*?await pendingSearch\.pushPromise[\s\S]*?pendingSearch\.template\s*\.popTo\(\)[\s\S]*?HybridAutoPlay\.popTemplate\(false\)[\s\S]*?pendingVoiceSearchTemplatePush = null/,
    );
    assert.match(
        autoPlaySource,
        /async function handleVoiceNavigation[\s\S]*?await dismissSupersededVoiceSearchTemplate\(requestGeneration\);[\s\S]*?if \(!requestIsCurrent\(\)\)/,
    );
    assert.match(
        autoPlaySource,
        /async function handleSearchResultSelected[\s\S]*?startNavigationImmediately = false[\s\S]*?const resolvedRoute = \{[\s\S]*?if \(startNavigationImmediately\) \{\s*startAutoPlayNavigation\(resolvedRoute\);\s*return;\s*\}[\s\S]*?await showRoutePreview\(resolvedRoute\)/,
    );
    assert.match(
        autoPlaySource,
        /if \(destinationLocation\)[\s\S]*?handleSearchResultSelected\([\s\S]*?startNavigationImmediately:\s*resolvedRequestType === 'navigation'[\s\S]*?const results = await searchTextPlaces[\s\S]*?handleSearchResultSelected\(results\[0\],[\s\S]*?startNavigationImmediately: resolvedRequestType === 'navigation'/,
    );
    assert.match(
        autoPlaySource,
        /function startAutoPlayNavigation[\s\S]*?rootMapTemplate\.startNavigation\(makeTripConfig\(route\)\)[\s\S]*?setSharedRoutingState\(\{\s*directionsRoute: route,\s*drivingModeIsActive: true/,
    );
});

test('Android Auto logs incoming actions and decisions to Metro in development', () => {
    assert.match(
        androidPlatformSource,
        /logAction\(action, payload = \{\}\)[\s\S]*?typeof __DEV__ === 'undefined' \|\| !__DEV__[\s\S]*?console\.log\(`\[Android Auto\] \$\{action\}`, payload\)/,
    );
    assert.match(
        autoPlaySource,
        /isReplay \? 'voice-request-replayed' : 'voice-request-received'[\s\S]*?coordinates: coordinates \?\? null,[\s\S]*?query: query \?\? null,[\s\S]*?requestType: requestType \?\? null/,
    );
    assert.match(
        autoPlaySource,
        /voice-request-classified[\s\S]*?nativeRequestType: requestType \?\? null[\s\S]*?resolvedRequestType/,
    );
    assert.match(
        autoPlaySource,
        /place-search-completed[\s\S]*?resultCount: results\.length/,
    );
    for (const action of [
        'single-result-countdown-started',
        'single-result-auto-advanced',
        'voice-destination-search-completed',
        'search-result-selected',
        'route-choices-presented',
        'navigation-start-requested',
    ]) {
        assert.match(autoPlaySource, new RegExp(`'${action}'`));
    }
    assert.match(
        sentrySource,
        /function beforeBreadcrumb[\s\S]*?category !== 'console'[\s\S]*?startsWith\(ANDROID_AUTO_METRO_LOG_PREFIX\)[\s\S]*?return null/,
    );
    assert.match(sentrySource, /beforeBreadcrumb,\s*beforeSend,/);
});

test('the dependency patch contains only source changes', () => {
    assert.match(autoPlayPatch, /AndroidAutoSession\.kt/);
    assert.match(autoPlayPatch, /AndroidManifest\.xml/);
    assert.match(autoPlayPatch, /HybridAutoPlay\.kt/);
    assert.match(autoPlayPatch, /AutoPlay\.nitro\.ts/);
    assert.match(autoPlayPatch, /requestType/);
    assert.match(autoPlayPatch, /android\.intent\.action\.VIEW/);
    assert.match(autoPlayPatch, /^\+.*NavigationRejectionReason/m);
    assert.match(autoPlayPatch, /^-.*Failed to parse navigation intent/m);
    assert.doesNotMatch(
        autoPlayPatch,
        /^\+.*Failed to parse navigation intent/m,
    );
    assert.doesNotMatch(autoPlayPatch, /android\/\.cxx|android\/build\//);
    assert.doesNotMatch(autoPlayPatch, /GIT binary patch/);
});
