import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const directionsSource = readFileSync(
    new URL('../directions.js', import.meta.url),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

test('next automotive maneuver distance follows canonical route progress', () => {
    assert.match(
        directionsSource,
        /function getNextDirectionsManeuver[\s\S]*?decorateActiveManeuver\(\s*nextManeuver,[\s\S]*?nextManeuver\.startDistance - progressDistance/,
    );
    assert.match(
        autoPlaySource,
        /getNextDirectionsManeuver\(\s*route,\s*userLocation,\s*routeProgress\s*\)/,
    );
});
