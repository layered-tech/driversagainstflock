import assert from 'node:assert/strict';
import test from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';
import * as presets from '../../../lib/osm/camera-presets.js';

function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const match = find(child, predicate);
        if (match) return match;
    }
    return null;
}

test('preview switches every manufacturer through the real preset tags and shared renderer', () => {
    const hooks = createHookHarness();
    const renders = [];
    const { CameraMarkerPreviewScreen } = loadTourModule(
        new URL('../camera-marker-preview-screen.js', import.meta.url),
        {
            react: hooks.react,
            'expo-router': {
                useRouter: () => ({ back() {} }),
                useLocalSearchParams: () => ({ preset: 'axon' }),
            },
            '@rnmapbox/maps': {
                MapView: 'MapView',
                Camera: 'Camera',
                ShapeSource: 'ShapeSource',
                CircleLayer: 'CircleLayer',
            },
            'react-native': {
                ScrollView: 'ScrollView',
                Text: 'Text',
                View: 'View',
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
            },
            '../../lib/osm/camera-presets': presets,
            '../design-system/primitives': {
                DafButton: 'Button',
                DafChip: 'Chip',
            },
            './map-assets': {
                AlprMarkerImages: 'Images',
                MarkerConeImages: 'Cones',
            },
            './config': {
                MAPBOX_STANDARD_STYLE_URL: 'mapbox://styles/mapbox/standard',
            },
            './constants': { MAX_ZOOM_LEVEL: 20 },
            './geo': { makeMarkerFeatureCollection: (markers) => markers },
            './map-canvas': {
                renderMarkerConeLayers: (args) => {
                    renders.push(['cones', args]);
                    return [];
                },
                renderMarkerPointLayers: (args) => {
                    renders.push(['markers', args]);
                    return [];
                },
            },
        },
    );
    const render = () => hooks.render(CameraMarkerPreviewScreen);
    const zoomValues = (tree) => {
        if (!tree || typeof tree !== 'object') return [];
        const own =
            tree.type === 'Chip' &&
            Array.isArray(tree.props?.children) &&
            tree.props.children[0] === 'Zoom '
                ? [tree.props.children[1]]
                : [];
        return [
            ...own,
            ...[tree.props?.children].flat(Infinity).flatMap(zoomValues),
        ];
    };

    try {
        assert.deepEqual(zoomValues(render()), [15, 16, 18, 20]);
        for (const { value } of presets.CAMERA_PRESETS.filter(
            ({ value }) => value !== 'custom',
        )) {
            find(
                render(),
                ({ props }) => props.testID === `marker-preview-${value}`,
            ).props.onPress();
            const tree = render();
            const marker = find(tree, ({ type }) => type === 'ShapeSource')
                .props.shape[0];
            assert.deepEqual(marker.properties.osm_nodes[0].tags, {
                ...presets.getPresetTags(value),
                'camera:direction': '180',
            });
            assert.ok(find(tree, ({ type }) => type === 'Images'));
        }
        find(
            render(),
            ({ props }) => props.children === 'Tilt',
        ).props.onPress();
        assert.equal(
            find(render(), ({ type }) => type === 'Camera').props.pitch,
            45,
        );
        assert.ok(
            renders.some(
                ([kind, args]) =>
                    kind === 'markers' && args.sourceID === 'marker-preview',
            ),
        );
        assert.ok(
            renders.some(([kind, args]) => kind === 'cones' && args.visible),
        );
    } finally {
        hooks.cleanup();
    }
});
