import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const source = readFileSync(
    new URL('../map-marker-views.js', import.meta.url),
    'utf8',
);
const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);

describe('E2E marker tap target', () => {
    test('uses a React Native overlay instead of a Mapbox MarkerView', () => {
        assert.match(
            source,
            /export function E2EMarkerTapOverlay\(\{ index, marker, onPress \}\)/,
        );
        assert.match(
            source,
            /className="absolute bottom-24 left-3 z-50 h-12 w-12"/,
        );
        assert.match(source, /collapsable=\{false\}/);
        assert.match(source, /onPress=\{handlePress\}/);
        assert.match(source, /testID=\{`map-marker-\$\{index\}-map`\}/);
        assert.match(mapScreenSource, /<E2EMarkerTapOverlay/);
        assert.doesNotMatch(mapCanvasSource, /<E2EMarkerTapTarget/);
    });
});
