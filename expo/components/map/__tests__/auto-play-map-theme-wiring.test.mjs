import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { getDrivingStreetLabelFilter } from '../driving-street-label-filter.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { featureFilter } = require('mapbox-gl/dist/style-spec/index.cjs');

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
const phoneMapSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);
const streetLabelsSource = readFileSync(
    new URL('../driving-street-labels.js', import.meta.url),
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

test('the shared phone and Auto Play canvas adds street pills during perspective follow', () => {
    assert.match(phoneMapSource, /<MapCanvas\b/);
    assert.match(autoPlayMapSurfaceContentSource, /<MapCanvas\b/);
    assert.match(
        mapCanvasSource,
        /isDrivingMode &&\s*isFollowing &&\s*!cameraIsLocked &&\s*navigationViewMode === DRIVING_MAP_VIEW_PERSPECTIVE\s*\? \(\s*<DrivingStreetLabels\s+isDarkMap=\{isDuskNightMapLightPreset\}\s+userLocation=\{userLocation\}\s+\/>/,
    );
});

test('the forward label filter excludes spelling variants of the current road', () => {
    const forwardFilter = getDrivingStreetLabelFilter('');
    for (const [currentRoad, excludedNames, otherName] of [
        [
            'West Lincoln Avenue',
            ['west lincoln avenue', 'w lincoln ave'],
            'east lincoln avenue',
        ],
        ['S. 92nd St', ['south 92nd street', 's 92nd st'], 's 91st st'],
        [
            'Main Street Northwest',
            ['main street northwest', 'main st nw'],
            'main st ne',
        ],
        [
            'West Mount Vernon Avenue',
            ['west mount vernon avenue', 'w mt vernon ave'],
            'east mount vernon avenue',
        ],
        ['Highway 164 North', ['highway 164 north', 'hwy 164 n'], 'hwy 164 s'],
    ]) {
        const filter = getDrivingStreetLabelFilter(currentRoad);
        assert.deepEqual(filter.slice(0, -1), forwardFilter);
        const [operator, [join, ...matches]] = filter.at(-1);
        assert.equal(operator, '!');
        assert.equal(join, 'any');
        assert.deepEqual(
            matches.map((match) => match[1][1][1]),
            [
                ['get', 'name'],
                ['get', 'name_en'],
            ],
        );
        for (const [operation, , [literal, names]] of matches) {
            assert.equal(operation, 'in');
            assert.equal(literal, 'literal');
            assert.ok(excludedNames.every((name) => names.includes(name)));
            assert.ok(!names.includes(otherName));
        }
    }
});

test('perspective street pills hide every segment of the current State Highway 164', () => {
    const { filter, dynamicFilter } = featureFilter(
        getDrivingStreetLabelFilter('State Highway 164'),
        '',
        null,
        'symbol',
    );
    const camera = { pitch: 60, zoom: 16 };
    const tileDistance = { bearing: [1, 0], center: [0, 0], scale: 1 };
    const roads = [
        { name: 'State Hwy 164' },
        { name: 'State Hwy 164' },
        { name: 'State Highway 164', name_en: 'State Hwy 164' },
        { name: 'State Hwy 165' },
        { name: 'State Hwy 164A' },
    ];
    const visibleRoads = roads.filter((road, index) => {
        const feature = { properties: { ...road, class: 'primary' }, type: 2 };
        const anchor = { x: 0.25 + index * 0.1, y: 0 };

        return (
            filter(camera, feature) &&
            dynamicFilter(camera, feature, undefined, anchor, tileDistance)
        );
    });

    assert.deepEqual(visibleRoads, roads.slice(3));
});

test('street pills extend farther ahead while leaving space around the puck', () => {
    const distanceRules = getDrivingStreetLabelFilter('')
        .slice(1)
        .filter(([, expression]) => expression[0] === 'distance-from-center');
    assert.deepEqual(distanceRules, [
        ['>=', ['distance-from-center'], 0.04],
        [
            '<=',
            ['distance-from-center'],
            ['interpolate', ['linear'], ['zoom'], 14, 0.9, 17, 1.7],
        ],
    ]);
});

test('both street pill themes register complete stretch and content metadata with their bitmap', () => {
    const { code } = transformSync(streetLabelsSource, {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require.resolve('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            require.resolve('@babel/plugin-transform-modules-commonjs'),
        ],
    });
    const loadStreetLabels = new Function('require', 'exports', code);

    for (const os of ['ios', 'android']) {
        const exports = {};
        const dependencies = {
            '@rnmapbox/maps': { Images: 'Images', SymbolLayer: 'SymbolLayer' },
            react: { useMemo: (callback) => callback() },
            'react-native': { Platform: { OS: os } },
            'react/jsx-runtime': require('react/jsx-runtime'),
            './current-road-context': { useStableCurrentRoadText: () => '' },
            './driving-street-label-filter': { getDrivingStreetLabelFilter },
        };
        loadStreetLabels(
            (name) => (name.endsWith('.png') ? name : dependencies[name]),
            exports,
        );

        for (const theme of ['light', 'dark']) {
            const labels = exports.DrivingStreetLabels({
                isDarkMap: theme === 'dark',
            });
            const [images, source] = labels.props.children;
            assert.equal(
                images.props.children,
                undefined,
                'child snapshots apply native props one at a time',
            );
            const imageId = source.props.children.props.style.iconImage;
            const entry = images.props.images[imageId];
            assert.equal(imageId, `driving-street-label-background-${theme}`);
            assert.ok(entry.image.endsWith(`-${theme}.png`));
            const png = readFileSync(
                new URL('../' + entry.image, import.meta.url),
            );
            const width = png.readUInt32BE(16);
            const height = png.readUInt32BE(20);
            assert.deepEqual(
                [width, height],
                [32 * entry.scale, 28 * entry.scale],
            );
            // RNMBXUtils converts metadata to pixels on iOS. Android accepts pixels directly.
            const scale = os === 'ios' ? entry.scale : 1;
            const pixels = (edges) => edges.map((edge) => edge * scale);
            assert.deepEqual(pixels(entry.content), [0, 0, width, height]);
            assert.deepEqual(entry.stretchX.map(pixels), [[39, 57]]);
            assert.deepEqual(entry.stretchY.map(pixels), [[39, 45]]);
        }
    }
});

test('street pill backgrounds keep their height and use emissive icon and text colors', () => {
    assert.match(streetLabelsSource, /iconTextFit: 'width'/);
    assert.match(streetLabelsSource, /iconTextFitPadding: \[0, 10, 0, 10\]/);
    assert.match(streetLabelsSource, /iconEmissiveStrength: 1/);
    assert.match(streetLabelsSource, /textEmissiveStrength: 1/);
});

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
