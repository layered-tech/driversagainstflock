import assert from 'node:assert/strict';
import test from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';
import * as presets from '../../../lib/osm/camera-presets.js';
import * as coneStyles from '../cone-view-styles.js';

const zoomStyles = [
    { minZoom: 0, imageName: 'marker-cone-z0' },
    { minZoom: 18, imageName: 'marker-cone-z18' },
];

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
            './camera-view-cone-model': {
                CameraViewConeModels: 'Models',
                renderMarkerConeModelLayers: (args) => [
                    { type: 'ModelLayer', props: args },
                ],
            },
            './config': {
                MAPBOX_STANDARD_STYLE_URL: 'mapbox://styles/mapbox/standard',
            },
            './constants': {
                MAX_ZOOM_LEVEL: 20,
                MARKER_CONE_ZOOM_STYLES: zoomStyles,
            },
            './cone-view-styles': coneStyles,
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
        const initialTree = render();
        assert.equal(
            find(initialTree, ({ type }) => type === 'Camera').props.pitch,
            45,
        );
        assert.equal(
            find(
                initialTree,
                ({ props }) => props.testID === 'marker-preview-cone-model',
            ).props.selected,
            true,
        );
        assert.ok(find(initialTree, ({ type }) => type === 'Models'));
        assert.equal(
            renders.findLast(([kind]) => kind === 'markers')[1].slot,
            'top',
        );
        assert.equal(
            find(initialTree, ({ type }) => type === 'Cones'),
            null,
        );
        assert.equal(
            renders.some(([kind]) => kind === 'cones'),
            false,
        );
        assert.equal(
            find(
                initialTree,
                ({ props }) => props.testID === 'marker-preview-cone-ground',
            ),
            null,
        );
        assert.equal(
            find(initialTree, ({ type }) => type === 'ModelLayer').props
                .sourceID,
            'marker-preview',
        );
        find(
            initialTree,
            ({ props }) => props.testID === 'marker-preview-orbit',
        ).props.onPress();
        const orbitTree = render();
        assert.equal(
            find(orbitTree, ({ type }) => type === 'Camera').props.heading,
            45,
        );
        assert.equal(
            find(orbitTree, ({ type }) => type === 'ModelLayer').props.sourceID,
            'marker-preview',
        );
        find(
            orbitTree,
            ({ props }) => props.testID === 'marker-preview-cone-beam',
        ).props.onPress();
        const beamTree = render();
        assert.equal(
            find(beamTree, ({ type }) => type === 'Models'),
            null,
        );
        assert.equal(
            find(beamTree, ({ type }) => type === 'ModelLayer'),
            null,
        );
        assert.equal(
            renders.findLast(([kind]) => kind === 'cones')[1]
                .iconPitchAlignment,
            'viewport',
        );
        for (const [mode, alignment] of [
            ['ground', 'map'],
            ['upright', 'viewport'],
        ]) {
            find(
                render(),
                ({ props }) => props.testID === `marker-preview-cone-${mode}`,
            ).props.onPress();
            const tree = render();
            assert.equal(
                find(
                    tree,
                    ({ props }) =>
                        props.testID === `marker-preview-cone-${mode}`,
                ).props.selected,
                true,
            );
            const args = renders.findLast(([kind]) => kind === 'cones')[1];
            assert.equal(args.iconPitchAlignment, alignment);
            assert.deepEqual(
                args.iconImage,
                coneStyles.coneImageExpression(zoomStyles, 'beam'),
            );
            assert.equal(
                find(tree, ({ type }) => type === 'ShapeSource').props.shape[0]
                    .properties.osm_nodes[0].tags['camera:direction'],
                '180',
            );
        }
        assert.deepEqual(zoomValues(render()), [15, 16, 18, 20]);
        for (const { value } of coneStyles.CONE_VIEW_STYLES) {
            find(
                render(),
                ({ props }) => props.testID === `marker-preview-cone-${value}`,
            ).props.onPress();
            const tree = render();
            assert.equal(
                find(
                    tree,
                    ({ props }) =>
                        props.testID === `marker-preview-cone-${value}`,
                ).props.selected,
                true,
            );
            assert.deepEqual(
                renders.findLast(([kind]) => kind === 'cones')[1].iconImage,
                coneStyles.coneImageExpression(zoomStyles, value),
            );
            assert.deepEqual(
                find(tree, ({ type }) => type === 'Cones').props.variants,
                coneStyles.CONE_VIEW_STYLES.map(({ value }) => value),
            );
        }
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
            0,
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
        find(
            render(),
            ({ props }) => props.testID === 'marker-preview-cone-model',
        ).props.onPress();
        find(
            render(),
            ({ props }) => props.testID === 'marker-preview-direction',
        ).props.onPress();
        const rotatedTree = render();
        assert.equal(
            find(rotatedTree, ({ type }) => type === 'ModelLayer').props
                .sourceID,
            'marker-preview',
        );
        assert.equal(
            find(rotatedTree, ({ type }) => type === 'ShapeSource').props
                .shape[0].properties.osm_nodes[0].tags['camera:direction'],
            '225',
        );
    } finally {
        hooks.cleanup();
    }
});
