import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

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
        assert.match(source, /export function E2EMarkerTapOverlay\(/);
        assert.match(source, /bottom-24/);
        assert.match(source, /collapsable=\{false\}/);
        assert.match(source, /onPress=\{handlePress\}/);
        assert.match(source, /testID=\{`map-marker-\$\{index\}-map`\}/);
        assert.match(mapScreenSource, /<E2EMarkerTapOverlay/);
        assert.doesNotMatch(mapCanvasSource, /<E2EMarkerTapTarget/);
    });

    test('keeps the mock marker target above the contribution placement controls', () => {
        const { E2EMarkerTapOverlay } = loadTourModule(
            new URL('../map-marker-views.js', import.meta.url),
            {
                '@rnmapbox/maps': {},
                'react-native': { Pressable: 'Pressable', View: 'View' },
                'react-native-svg': {
                    default: 'Svg',
                    Circle: 'Circle',
                    Path: 'Path',
                },
                './geo': { getMarkerCoordinate: () => [-97.74, 30.26] },
            },
        );
        for (const contributePlacementIsActive of [false, true]) {
            const presses = [];
            const target = E2EMarkerTapOverlay({
                contributePlacementIsActive,
                index: 0,
                marker: { id: 'camera' },
                onPress: (event) => presses.push(event),
            });
            assert.match(
                target.props.className,
                contributePlacementIsActive ? /top-1\/2/ : /bottom-24/,
            );
            assert.match(mapScreenSource, /contributePlacementIsActive=\{/);
            target.props.onPress();
            assert.deepEqual(
                presses[0].features[0].geometry.coordinates,
                [-97.74, 30.26],
            );
        }
    });
});
