import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const directionsRouteSheetSource = readFileSync(
    new URL('../directions-route-sheet.js', import.meta.url),
    'utf8',
);
const directionsRouteRequestSource = readFileSync(
    new URL('../use-directions-route-request.js', import.meta.url),
    'utf8',
);
const directionsApiSource = readFileSync(
    new URL('../api.js', import.meta.url),
    'utf8',
);
const mapSearchSource = readFileSync(
    new URL('../use-map-search.js', import.meta.url),
    'utf8',
);
const mapPreferencesSource = readFileSync(
    new URL('../use-map-preferences-state.js', import.meta.url),
    'utf8',
);

test('presents the directions sheet after the route renders', () => {
    const routeSheetPresentationEffectCount = [
        ...directionsRouteSheetSource.matchAll(
            /const presentRouteSheet = \(\) => \{/g,
        ),
    ].length;

    assert.equal(routeSheetPresentationEffectCount, 1);
    assert.match(
        directionsRouteSheetSource,
        /if \(!mapPreferencesAreLoaded \|\| !directionsRoute\) \{\s+return undefined;\s+\}/,
    );
    assert.match(
        directionsRouteSheetSource,
        /const frame = requestAnimationFrame\(\(\) => \{\s+if \(!presentRouteSheet\(\)\) \{/,
    );
    assert.match(
        directionsRouteSheetSource,
        /retry = setTimeout\(presentRouteSheet, 300\);/,
    );
    assert.match(
        directionsRouteSheetSource,
        /cancelAnimationFrame\(frame\);[\s\S]*?if \(retry !== null\) \{\s+clearTimeout\(retry\);/,
    );
    assert.doesNotMatch(
        directionsRouteRequestSource,
        /setDirectionsRoute\(nextRoute\);\s+directionsRouteSheetRef\.current\?\.present\(\);/,
    );
});

test('keeps route-selection camera fitting under the map screen owner', () => {
    const routeSelectionStart = mapSearchSource.indexOf(
        'const handleDirectionsRouteSelect = useCallback(',
    );
    const routeSelectionEnd = mapSearchSource.indexOf(
        'const handleDirectionsAdvancedSettingsApply = useCallback(',
        routeSelectionStart,
    );
    const routeSelectionSource = mapSearchSource.slice(
        routeSelectionStart,
        routeSelectionEnd,
    );

    assert.ok(
        routeSelectionStart >= 0 && routeSelectionEnd > routeSelectionStart,
    );
    assert.match(routeSelectionSource, /setDirectionsRoute\(nextRoute\)/);
    assert.doesNotMatch(routeSelectionSource, /fitCameraToBounds/);
});

test('keeps advanced settings available and recalculates the selected route', () => {
    assert.match(
        directionsRouteSheetSource,
        /testID="directions-route-advanced-settings-toggle"/,
    );
    assert.match(
        directionsRouteSheetSource,
        /testID="directions-route-avoid-distance-input"/,
    );
    assert.match(
        directionsRouteSheetSource,
        /handleDirectionsAdvancedSettingsApply\(settings\)/,
    );
    assert.match(
        mapSearchSource,
        /destinationWaypoint = directionsRoute\?\.destination;[\s\S]*?startWaypoint = directionsRoute\?\.start;[\s\S]*?stopWaypoints: directionsRoute\?\.stopWaypoints \?\? \[\]/,
    );
    assert.match(
        mapSearchSource,
        /selectedRouteKey:\s+getSelectedDirectionsRouteKey\(directionsRoute\)/,
    );
    assert.match(
        mapSearchSource,
        /currentLocationWaypointNeedsRefresh\(\{[\s\S]*?value: directionsStopValue,[\s\S]*?waypoint: directionsStopWaypoint,[\s\S]*?setDirectionsStopWaypoint\(directionsCurrentLocationWaypoint\)/,
    );
    assert.match(
        directionsApiSource,
        /getAdvancedRouteSettingsRequestPayload\([\s\S]*?normalizedAdvancedRouteSettings/,
    );
    assert.match(
        directionsRouteRequestSource,
        /getDirections\(\{\s+advancedRouteSettings:\s+normalizedAdvancedRouteSettings,/,
    );
});

test('persists advanced settings and reuses them for later route requests', () => {
    assert.match(
        mapSearchSource,
        /setAdvancedRouteSettings\(advancedRouteSettings\);[\s\S]*?requestDirectionsRoute\(\{/,
    );
    assert.match(
        mapPreferencesSource,
        /getStoredAdvancedRouteSettings\(preferences\)[\s\S]*?setAdvancedRouteSettingsState\(storedAdvancedRouteSettings\)/,
    );
    assert.match(
        mapPreferencesSource,
        /getPersistableMapPreferences\([\s\S]*?advancedRouteSettings,[\s\S]*?mapPreferencesPersistenceScheduler\.schedule/,
    );
    assert.match(
        directionsApiSource,
        /getSharedMapPreferencesState\(\)\.advancedRouteSettings[\s\S]*?advancedRouteSettings \?\? storedAdvancedRouteSettings/,
    );
    assert.match(
        directionsApiSource,
        /route: \{[\s\S]*?advancedRouteSettings: normalizedAdvancedRouteSettings/,
    );
});

test('offers the selected route as selectable GPX or KML export text', () => {
    const mapScreenSource = readFileSync(
        new URL('../../map-screen.js', import.meta.url),
        'utf8',
    );
    const drivingGuidanceSource = readFileSync(
        new URL('../driving-guidance-cards.js', import.meta.url),
        'utf8',
    );

    assert.match(
        directionsRouteSheetSource,
        /routeExportIsAvailable \? \([\s\S]*?testID="directions-route-export-button"[\s\S]*?Export route/,
    );
    assert.match(
        drivingGuidanceSource,
        /routeExportIsAvailable \? \([\s\S]*?testID="driving-route-export-button"[\s\S]*?Export route/,
    );
    assert.match(
        mapScreenSource,
        /<RouteExportModal[\s\S]*?route=\{directionsRoute\}/,
    );
    assert.match(
        mapScreenSource,
        /const routeExportIsAvailable =[\s\S]*?SHOW_MAP_DEBUG_CONTROLS && debugOverlayIsVisible/,
    );
});
