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
