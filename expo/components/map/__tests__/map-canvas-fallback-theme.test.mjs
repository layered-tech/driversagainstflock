import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapScreenContextSource = readFileSync(
    new URL('../map-screen-context.js', import.meta.url),
    'utf8',
);

describe('MapCanvas fallback theme', () => {
    test('uses an explicit car appearance while retaining handset defaults', () => {
        assert.match(
            mapCanvasSource,
            /const systemColorScheme = useColorScheme\(\);[\s\S]*?const mapFallbackIsDarkMode =\s*isDarkModeOverride \?\? systemColorScheme === 'dark'/,
        );
        assert.match(
            mapCanvasSource,
            /const mapFallbackContainerClassName = mapFallbackIsDarkMode/,
        );
        assert.match(
            mapCanvasSource,
            /const mapFallbackTextClassName = mapFallbackIsDarkMode/,
        );
        assert.match(
            mapScreenContextSource,
            /useAutoPlayMapScreenContextValues\([\s\S]*?isDarkModeOverride: presentation\.isDarkMapLayer/,
        );

        const fallbackSource = mapCanvasSource.match(
            /if \(!mapPreferencesAreLoaded\)[\s\S]*?return \(\s*<NativeWindMapView/,
        )?.[0];

        assert.ok(fallbackSource, 'expected the map fallback render branches');
        assert.doesNotMatch(fallbackSource, /dark:/);
        assert.match(
            fallbackSource,
            /className=\{mapFallbackContainerClassName\}/,
        );
        assert.match(fallbackSource, /className=\{mapFallbackTextClassName\}/);
    });
});
