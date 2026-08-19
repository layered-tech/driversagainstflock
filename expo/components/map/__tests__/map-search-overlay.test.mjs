import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const mapSearchOverlaySource = readFileSync(
    new URL('../map-search-overlay.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);

describe('map search overlay', () => {
    test('sizes the directions row from its full field column', () => {
        assert.match(
            mapSearchOverlaySource,
            /className="flex-row items-start gap-2\.5"[\s\S]*?className="relative w-3 self-stretch"[\s\S]*?directionsStopIsVisible[\s\S]*?'min-h-\[148px\]'[\s\S]*?'min-h-24'[\s\S]*?map-directions-destination-input-/,
        );
        assert.doesNotMatch(
            mapSearchOverlaySource,
            /className="flex-row items-stretch gap-2\.5"/,
        );
    });

    test('places map controls below the runtime top safe-area inset', () => {
        assert.match(
            mapScreenSource,
            /className="absolute inset-0 z-40"[\s\S]*?paddingLeft: safeAreaInsets\.left \+ 12[\s\S]*?paddingRight: safeAreaInsets\.right \+ 12[\s\S]*?paddingTop: safeAreaInsets\.top \+ 12/,
        );
        assert.doesNotMatch(mapScreenSource, /NativeWindSafeAreaView/);
    });
});
