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

test('presents the directions sheet after the route renders', () => {
    assert.match(
        directionsRouteSheetSource,
        /if \(!mapPreferencesAreLoaded \|\| !directionsRoute\) \{\s+return undefined;\s+\}/,
    );
    assert.match(
        directionsRouteSheetSource,
        /const frame = requestAnimationFrame\(presentRouteSheet\);/,
    );
    assert.match(
        directionsRouteSheetSource,
        /const retry = setTimeout\(presentRouteSheet, 300\);/,
    );
    assert.match(
        directionsRouteSheetSource,
        /cancelAnimationFrame\(frame\);\s+clearTimeout\(retry\);/,
    );
    assert.doesNotMatch(
        directionsRouteRequestSource,
        /setDirectionsRoute\(nextRoute\);\s+directionsRouteSheetRef\.current\?\.present\(\);/,
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
