import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlayMapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);

test('Android Auto retries the initial marker load when the map becomes ready', () => {
    assert.match(
        autoPlayMapSurfaceSource,
        /const handleMapLoaded = useCallback\(\(\) => \{[\s\S]*?markerLoadsEnabledRef\.current = true;[\s\S]*?latestMapBoundsRef\.current[\s\S]*?scheduleMarkerLoad\(latestMapBoundsRef\.current, 0\);/,
    );
});

test('Android Auto remounts route and marker sources after map attachment', () => {
    assert.match(
        mapCanvasSource,
        /key=\{`directions-route-source-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
    assert.match(
        mapCanvasSource,
        /key=\{`\$\{markerClusteredSourceID\}-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
    assert.match(
        mapCanvasSource,
        /key=\{`\$\{markerUnclusteredSourceID\}-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
});
