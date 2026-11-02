import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const sharedMapStateSource = readFileSync(
    new URL('../shared-map-state.js', import.meta.url),
    'utf8',
);

test('keeps high-frequency location updates out of the shared preference context', () => {
    const valueStart = sharedMapStateSource.indexOf('const value = useMemo');
    const locationValueStart = sharedMapStateSource.indexOf(
        'const locationValue = useMemo',
    );
    const preferenceContextSource = sharedMapStateSource.slice(
        valueStart,
        locationValueStart,
    );

    assert.match(sharedMapStateSource, /const SharedMapStateContext/);
    assert.match(sharedMapStateSource, /const SharedMapLocationStateContext/);
    assert.doesNotMatch(
        preferenceContextSource,
        /userLocation: mapPreferences\.userLocation/,
    );
    assert.match(
        sharedMapStateSource.slice(locationValueStart),
        /userLocation: mapPreferences\.userLocation/,
    );
});

test('keeps MapCanvas subscribed only to its canvas and location contexts', () => {
    assert.match(mapCanvasSource, /useMapCanvasContext\(\)/);
    assert.match(mapCanvasSource, /useMapLocationContext\(\)/);
    assert.doesNotMatch(mapCanvasSource, /useMapSearchContext\(\)/);
});

test('car maps without contribution state never mount draft markers', () => {
    assert.match(mapCanvasSource, /contributePlacementIsActive = false/);
    assert.match(
        mapCanvasSource,
        /\{contributePlacementIsActive \?\s*\(?\s*<ContributeDraftPinMarkers \/>\s*\)?\s*:\s*null\}/,
    );
});

test('hosted contribution markers receive the original canvas context', () => {
    const { MapCanvasContextBridge } = loadTourModule(
        new URL('../map-screen-context.js', import.meta.url),
        {
            react: {
                createContext: () => ({ Provider: Symbol('Provider') }),
                useContext: () => null,
                useMemo: (create) => create(),
            },
        },
    );
    const canvas = { contributePins: [{ id: 'draft-camera' }] };
    const markers = { type: 'ContributeDraftPinMarkers' };
    const bridge = MapCanvasContextBridge({ value: canvas, children: markers });
    assert.equal(bridge.props.value, canvas);
    assert.equal(bridge.props.children, markers);
});
