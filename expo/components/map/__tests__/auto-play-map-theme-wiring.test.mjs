import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const androidAutoMapSurfaceSource = readFileSync(
    new URL('../../android-auto-map-surface.js', import.meta.url),
    'utf8',
);
const carPlayMapSurfaceSource = readFileSync(
    new URL('../../carplay-map-surface.js', import.meta.url),
    'utf8',
);
const autoPlayMapSurfaceContentSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapScreenContextSource = readFileSync(
    new URL('../map-screen-context.js', import.meta.url),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

describe('Auto Play map theme wiring', () => {
    test('only Android Auto enables host-driven automatic map presets', () => {
        assert.match(
            androidAutoMapSurfaceSource,
            /usesHostColorSchemeForAutomaticMapPreset: true/,
        );
        assert.match(
            carPlayMapSurfaceSource,
            /usesHostColorSchemeForAutomaticMapPreset: false/,
        );
    });

    test('the map surface resolves host appearance before applying the Mapbox preset', () => {
        assert.match(
            autoPlayMapSurfaceContentSource,
            /resolveAutoPlayMapLightPresetPreference\(\{[\s\S]*?colorScheme: autoPlayColorScheme,[\s\S]*?lightPresetPreference: mapPreferences\.mapLightPresetPreference,[\s\S]*?usesHostColorSchemeForAutomaticMapPreset,[\s\S]*?\}\);[\s\S]*?useMapboxStandardLightPreset\(/,
        );
    });

    test('the car surface threads the resolved map appearance into every app-owned overlay', () => {
        assert.match(
            autoPlayMapSurfaceContentSource,
            /useMapPresentation\(\{[\s\S]*?isDarkModeOverride:\s*mapLightPresetUsesDarkAppearance\(mapLightPreset\)/,
        );
        assert.match(
            autoPlayMapSurfaceContentSource,
            /<AutoPlayMapStatusOverlay[\s\S]*?isDarkMode=\{presentation\.isDarkMapLayer\}/,
        );
        assert.match(
            autoPlayMapSurfaceContentSource,
            /<AutoPlayTopRightStatusOverlay[\s\S]*?isDarkMode=\{presentation\.isDarkMapLayer\}/,
        );
    });

    test('remounts the Mapbox style import when its light preset changes', () => {
        assert.match(
            mapCanvasSource,
            /key=\{`\$\{MAPBOX_STANDARD_STYLE_IMPORT_ID\}-\$\{mapStyleURL\}-\$\{mapLightPreset\}`\}/,
        );
    });

    test('Android Auto logs each preset only after Mapbox renders it', () => {
        assert.match(
            mapCanvasSource,
            /onDidFinishRenderingFrameFully=\{[\s\S]*?handleMapFinishedRenderingFrameFully[\s\S]*?\}/,
        );
        assert.match(
            mapCanvasSource,
            /onMapAppearanceApplied\?\.\(mapLightPreset\)/,
        );
        assert.match(
            mapScreenContextSource,
            /onMapAppearanceApplied,[\s\S]*?onMapAppearanceApplied,/,
        );
        assert.match(
            autoPlayMapSurfaceContentSource,
            /const \[appliedMapLightPreset, setAppliedMapLightPreset\] =\s*useState\(null\)/,
        );
        assert.match(
            autoPlayMapSurfaceContentSource,
            /notifyAutoPlayMapButtonAppearance\(\{[\s\S]*?mapLightPreset: appliedMapLightPreset,[\s\S]*?\}\)/,
        );
        assert.match(
            autoPlaySource,
            /mapLightPresetChanged =[\s\S]*?nextAppearance\.mapLightPreset !==[\s\S]*?rootMapButtonAppearance\.mapLightPreset[\s\S]*?mapLightPresetChanged &&[\s\S]*?logAutoPlayPlatformAction\([\s\S]*?`map-preset-\$\{nextAppearance\.mapLightPreset\}`/,
        );
    });
});
