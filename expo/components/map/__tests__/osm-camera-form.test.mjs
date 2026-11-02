import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';
import * as cameraManufacturers from '../../../lib/osm/camera-manufacturers.js';
import * as cameraPresets from '../../../lib/osm/camera-presets.js';
import { CAMERA_MOUNT_OPTIONS } from '../../../lib/osm/camera-schema.js';

function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const match = find(child, predicate);
        if (match) return match;
    }
    return null;
}
function createForm(
    details,
    platform = 'android',
    duo = false,
    tablet = false,
) {
    const hooks = createHookHarness();
    const changes = [];
    const pin = { latitude: 30, longitude: -97, details };
    const { CameraForm } = loadTourModule(
        new URL('../../contribute/camera-form.js', import.meta.url),
        {
            './camera-reference-images': {
                CAMERA_REFERENCE_IMAGES: Object.fromEntries(
                    cameraManufacturers.CAMERA_MANUFACTURERS.flatMap(
                        ({ referenceImages }) =>
                            referenceImages.map((name) => [
                                name,
                                `bundled:${name}`,
                            ]),
                    ),
                ),
            },
            react: hooks.react,
            '../root/duo-device-context': { useDuoDevice: () => duo },
            '../../lib/osm/camera-manufacturers': cameraManufacturers,
            '../root/native-navigation': {
                FullWidthSafeAreaBand: 'FullWidthSafeAreaBand',
                NativeNavigationAction: 'NativeNavigationAction',
                NativeModalContent: 'NativeModalContent',
            },
            'react-native': {
                Image: Object.assign(function Image() {}, {
                    resolveAssetSource: (source) =>
                        source === 'bundled:axon-1.webp'
                            ? { width: 1200, height: 600 }
                            : source === 'bundled:axon-2.webp'
                              ? { width: 600, height: 1200 }
                              : { width: 1200, height: 900 },
                }),
                KeyboardAvoidingView: 'KeyboardAvoidingView',
                Modal: 'Modal',
                Platform: { OS: platform, Version: 36, isPad: tablet },
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                Text: 'Text',
                View: 'View',
                useColorScheme: () => 'light',
                useWindowDimensions: () => ({ width: duo ? 982 : 390 }),
            },
            '../../lib/osm/camera-schema': { CAMERA_MOUNT_OPTIONS },
            '../../lib/osm/camera-presets': cameraPresets,
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ top: 24, bottom: 10 }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': {
                DafButton: 'Button',
                DafChip: 'Chip',
                DafSectionLabel: 'SectionLabel',
                DafTextInput: 'TextInput',
            },
            '../design-system/tokens': {
                getDafTheme: () => ({ text: { tertiary: '#888' } }),
            },
            './compass-dial': { CompassDial: 'Dial' },
            './step-header': { ContributePageHeader: 'Header' },
            './contribute-tour-target': { ContributeTourTarget: 'Target' },
            './contribute-tour-overlay': { ContributeTourOverlay: 'Overlay' },
            './osm-tags': { formatBearingChip: (value) => `${value}°` },
            '../../assets/camera-presets/flock.jpg': 'flock-image',
            '../../assets/camera-presets/motorola.jpg': 'motorola-image',
            '../../assets/camera-presets/genetec.webp': 'genetec-image',
            '../../assets/camera-presets/axon.webp': 'axon-image',
            '../../assets/camera-presets/leonardo.jpg': 'leonardo-image',
            '../../assets/camera-presets/neology.jpg': 'neology-image',
            '../../assets/camera-presets/verkada.png': 'verkada-image',
        },
    );
    const render = () =>
        hooks.render(() =>
            CameraForm({
                pin,
                onDetailsChange: (patch) => {
                    changes.push(patch);
                    Object.assign(pin.details, patch);
                },
                onLocationChange: () => {},
                onSave: () => {},
                onBack: () => {},
            }),
        );
    return {
        render,
        changes,
        pin,
        element: (id) => find(render(), (node) => node.props?.testID === id),
        type: (type) => find(render(), (node) => node.type === type),
        cleanup: hooks.cleanup,
    };
}

test('long press opens a persistent brand gallery without selecting the brand', () => {
    const form = createForm({ preset: 'flock' });
    try {
        const photo = form.element('contribute-preset-axon');
        photo.props.onPressIn();
        photo.props.onLongPress();
        assert.ok(form.element('contribute-preset-preview'));
        assert.deepEqual(form.changes, []);
        photo.props.onPressOut?.();
        photo.props.onPress();
        assert.ok(form.element('contribute-preset-preview'));
        assert.ok(form.element('contribute-reference-gallery'));
        form.element('contribute-brand-preview-close').props.onPress();
        assert.equal(form.element('contribute-preset-preview'), null);
        assert.equal(form.element('contribute-reference-gallery'), null);
        assert.equal(form.pin.details.preset, 'flock');
        photo.props.onPressIn();
        photo.props.onPress();
        assert.equal(form.pin.details.preset, 'axon');
    } finally {
        form.cleanup();
    }
});

test('Generic and Custom tags show a selected check like the vendor presets', () => {
    const form = createForm({ preset: 'flock' });
    try {
        for (const preset of ['generic', 'custom']) {
            form.element(`contribute-preset-${preset}`).props.onPress();
            const tile = form.element(`contribute-preset-${preset}`);
            assert.equal(tile.props.accessibilityState.selected, true);
            assert.ok(
                find(
                    tile,
                    (node) =>
                        node.type === 'Icon' && node.props.name === 'check',
                ),
            );
        }
    } finally {
        form.cleanup();
    }
});

test('switching to custom tags preserves tags and the dial writes the same raw direction row', () => {
    const form = createForm({
        preset: 'genetec',
        directions: [90, 270],
        mount: 'pole',
        operator: 'Caltrans',
    });
    try {
        form.element('contribute-preset-custom').props.onPress();
        assert.equal(form.pin.details.preset, 'custom');
        assert.equal(
            cameraPresets.rowsToTags(form.pin.details.rawTags).manufacturer,
            'Genetec',
        );
        form.type('Dial').props.onChange(110);
        assert.equal(
            cameraPresets.rowsToTags(form.pin.details.rawTags)[
                'camera:direction'
            ],
            '110;270',
        );
        form.element('contribute-remove-direction-0').props.onPress();
        assert.equal(
            cameraPresets.rowsToTags(form.pin.details.rawTags)[
                'camera:direction'
            ],
            '270',
        );
    } finally {
        form.cleanup();
    }
});

test('blocks duplicate or incomplete tags and protects the camera identity tag', () => {
    const form = createForm({
        preset: 'custom',
        rawTags: [
            { key: 'man_made', value: 'surveillance' },
            { key: 'ref', value: 'a' },
            { key: 'ref', value: 'b' },
        ],
    });
    try {
        assert.equal(
            form.element('contribute-next-changeset-button').props.disabled,
            true,
        );
        form.pin.details.rawTags = [{ key: 'man_made', value: 'surveillance' }];
        assert.equal(
            form.element('contribute-next-changeset-button').props.disabled,
            false,
        );
        form.pin.details.rawTags = [];
        assert.equal(
            form.element('contribute-next-changeset-button').props.disabled,
            true,
        );
    } finally {
        form.cleanup();
    }
});

for (const width of [390, 466, 982, 1194])
    test(`camera placement targets the visible map and waits for shared state at width ${width}`, async () => {
        const hooks = createHookHarness();
        const routes = [];
        const points = [];
        const coordinates = [];
        const pin = {
            id: 'new-pin',
            latitude: 30,
            longitude: -97,
            details: { preset: 'flock' },
        };
        const contribution = {
            contributePlacementIsActive: true,
            pins: [],
            removals: [],
            addPinAtCoordinate: (coordinate) => {
                coordinates.push(coordinate);
                return pin;
            },
            tour: { dismissPhase() {}, dismissStep() {} },
        };
        const { ContributePlacementSheet } = loadTourModule(
            new URL(
                '../../contribute/contribute-placement-sheet.js',
                import.meta.url,
            ),
            {
                react: hooks.react,
                '../root/duo-device-context': {
                    useDuoDevice: () => width === 466 || width === 982,
                },
                '../root/native-navigation': {
                    FullWidthSafeAreaBand: 'FullWidthSafeAreaBand',
                    NativeNavigationAction: 'NativeNavigationAction',
                    NativeModalContent: 'NativeModalContent',
                },
                'react-native': {
                    Platform: { isPad: width === 1194 },
                    Pressable: 'Pressable',
                    Text: 'Text',
                    View: 'View',
                    useWindowDimensions: () => ({ width, height: 800 }),
                },
                '@gorhom/bottom-sheet': { BottomSheetScrollView: 'ScrollView' },
                'expo-router': {
                    router: { push: (route) => routes.push(route) },
                    useFocusEffect: (callback) =>
                        hooks.react.useEffect(callback, [callback]),
                },
                '../../lib/osm/camera-presets': cameraPresets,
                '../../lib/osm/edit-tags': { REMOVAL_REASONS: [] },
                '../design-system/icon': { Icon: 'Icon' },
                '../design-system/primitives': {
                    DafButton: 'Button',
                    DafIconButton: 'IconButton',
                },
                '../design-system/tokens': { dafSemanticColors: {} },
                '../map/native-components': {
                    NativeWindBottomSheetModal: 'Modal',
                    NativeWindBottomSheetView: 'View',
                    NativeWindBottomSheetScrollView: 'ScrollView',
                },
                '../map/use-bottom-sheet-presented-state': {
                    useBottomSheetPresentedState: () => ({
                        bottomSheetIsPresented: true,
                    }),
                },
                './changeset-summary': {
                    getChangesetSummary: (pins) => ({
                        total: pins.length,
                        label: 'added',
                    }),
                },
                './contribute-state': { useContribute: () => contribution },
                './contribute-tour-target': { ContributeTourTarget: 'Target' },
                './contribute-tour-overlay': {
                    ContributeTourOverlay: 'Overlay',
                },
            },
        );
        const render = () =>
            hooks.render(() =>
                ContributePlacementSheet({
                    insets: {
                        bottom: 10,
                        left: 0,
                        right: width === 466 ? 84 : 0,
                    },
                    mapPreferencesAreLoaded: true,
                    screenIsFocused: true,
                    tourTargets: { current: {} },
                    locationController: {
                        mapViewRef: {
                            current: {
                                getCenter: async () => [-97, 30],
                                getCoordinateFromView: async (point) => {
                                    points.push(point);
                                    return [-97, 30];
                                },
                            },
                        },
                    },
                }),
            );
        try {
            if (width === 466) {
                const tray = find(
                    render(),
                    (node) =>
                        node.props?.testID === 'contribute-placement-sheet',
                );
                assert.equal(tray.props.style.left, 12);
                assert.equal(tray.props.style.right, 96);
            }
            await find(
                render(),
                (node) => node.props?.testID === 'contribute-add-camera-button',
            ).props.onPress();
            assert.deepEqual(coordinates, [{ latitude: 30, longitude: -97 }]);
            assert.deepEqual(
                points,
                width === 1194
                    ? [[812, 400]]
                    : width === 982
                      ? [[736.5, 400]]
                      : [],
            );
            render();
            assert.deepEqual(
                routes,
                [],
                'the route must not open while its pin is missing',
            );
            contribution.pins = [pin];
            render();
            assert.deepEqual(routes, ['/contribute/camera/0']);
            assert.ok(
                find(
                    render(),
                    (node) =>
                        node.props?.testID ===
                        'contribute-placement-sheet-title',
                ),
                'staged changes automatically expand the list',
            );
            assert.equal(
                find(
                    render(),
                    (node) =>
                        node.props?.testID === 'contribute-add-camera-button',
                ),
                null,
            );
            const placedTarget = find(
                render(),
                (node) => node.type === 'Target' && node.props.id === 'placed',
            );
            assert.ok(
                find(
                    placedTarget,
                    (node) =>
                        node.props?.testID === 'contribute-next-details-button',
                ),
                'the staged tour targets the visible tray Review button',
            );
            const modal = find(render(), (node) => node.type === 'Modal');
            modal.props.ref.current = { dismiss: () => routes.push('dismiss') };
            find(
                render(),
                (node) => node.props?.testID === 'contribute-pin-row-0',
            ).props.onPress();
            assert.deepEqual(
                routes.slice(-2),
                ['dismiss', '/contribute/camera/0'],
                'dismiss the native tray before navigating to the form',
            );
        } finally {
            hooks.cleanup();
        }
    });

test('a queued camera focus event reads the latest committed pin instead of redirecting with an old empty draft', () => {
    const hooks = createHookHarness();
    const focusCallbacks = [];
    const routes = [];
    const contribution = {
        pins: [],
        removals: [],
        continueOnMap() {},
        removePin() {},
        tour: {},
    };
    const { default: CameraDetailsScreen } = loadTourModule(
        new URL('../../contribute/camera-details-screen.js', import.meta.url),
        {
            react: hooks.react,
            '../root/duo-device-context': { useDuoDevice: () => duo },
            '../root/native-navigation': {
                FullWidthSafeAreaBand: 'FullWidthSafeAreaBand',
                NativeNavigationAction: 'NativeNavigationAction',
                NativeModalContent: 'NativeModalContent',
            },
            'react-native': {
                BackHandler: { addEventListener: () => ({ remove() {} }) },
            },
            'expo-router': {
                router: {
                    replace: (route) => routes.push(route),
                    navigate: (route) => routes.push(route),
                },
                useFocusEffect: (callback) => focusCallbacks.push(callback),
                useIsFocused: () => true,
                useLocalSearchParams: () => ({ index: '0' }),
            },
            './camera-form': { CameraForm: 'Form' },
            './contribute-state': { useContribute: () => contribution },
        },
    );
    try {
        hooks.render(CameraDetailsScreen);
        contribution.pins = [
            {
                id: 'new',
                details: { staged: false },
                latitude: 30,
                longitude: -97,
            },
        ];
        hooks.render(CameraDetailsScreen);
        focusCallbacks[0]();
        assert.deepEqual(routes, []);
    } finally {
        hooks.cleanup();
    }
});

test('switching to Axon repairs both identity tags without exposing map preview', () => {
    const form = createForm(
        cameraPresets.getCameraDetailsFromTags({
            ...cameraPresets.getPresetTags('flock'),
            note: 'Preserve',
        }),
    );
    try {
        form.element('contribute-preset-axon').props.onPress();
        const tags = cameraPresets.getCameraFormTags(form.pin.details);
        assert.equal(tags.manufacturer, 'Axon Enterprise');
        assert.equal(tags['manufacturer:wikidata'], 'Q690604');
        assert.equal(tags.note, 'Preserve');
        assert.equal(form.element('contribute-map-marker-preview'), null);
        assert.equal(form.element('contribute-reference-gallery'), null);
    } finally {
        form.cleanup();
    }
});

test('brand gallery shows all references for the held brand and closes with the system back action', () => {
    const form = createForm({ preset: 'flock' });
    try {
        assert.equal(form.element('contribute-reference-gallery'), null);
        form.element('contribute-preset-motorola').props.onLongPress();
        const gallery = form.element('contribute-reference-gallery');
        const photos = gallery.props.children[1];
        assert.equal(
            photos.length,
            cameraManufacturers.CAMERA_MANUFACTURERS.find(
                ({ value }) => value === 'motorola',
            ).referenceImages.length,
        );
        assert.equal(photos[0].props.source, 'bundled:motorola-1.jpg');
        assert.equal(form.pin.details.preset, 'flock');
        form.element('contribute-brand-preview-modal').props.onRequestClose();
        assert.equal(form.element('contribute-reference-gallery'), null);
    } finally {
        form.cleanup();
    }
});

test('Axon gallery uses each distinct reference and fits each loaded image aspect ratio', () => {
    const form = createForm({ preset: 'flock' });
    try {
        form.element('contribute-preset-axon').props.onLongPress();
        const photos = () =>
            form.element('contribute-reference-gallery').props.children[1];
        const expected = cameraManufacturers.CAMERA_MANUFACTURERS.find(
            ({ value }) => value === 'axon',
        ).referenceImages;
        assert.deepEqual(
            photos().map(({ props }) => props.source),
            expected.map((name) => `bundled:${name}`),
        );
        assert.equal(
            new Set(photos().map(({ props }) => props.source)).size,
            expected.length,
        );
        const layout = (width) =>
            form
                .element('contribute-reference-gallery')
                .props.onLayout({ nativeEvent: { layout: { width } } });
        layout(320);
        assert.deepEqual(
            photos().map(({ props }) => props.style),
            [
                { width: 320, height: 160 },
                { width: 320, height: 640 },
                { width: 320, height: 240 },
            ],
        );
        layout(280);
        assert.deepEqual(
            photos().map(({ props }) => props.style),
            [
                { width: 280, height: 140 },
                { width: 280, height: 560 },
                { width: 280, height: 210 },
            ],
        );
        assert.ok(
            photos().every(({ props }) => props.resizeMode === 'contain'),
        );
    } finally {
        form.cleanup();
    }
});

for (const platform of ['ios', 'android']) {
    test(`camera form keeps the editable fields and save action within keyboard avoidance on ${platform}`, () => {
        const tree = createForm(
            { preset: 'flock', directions: [] },
            platform,
        ).render();
        assert.equal(tree.type, 'KeyboardAvoidingView');
        assert.equal(tree.props.behavior, 'padding');
        const scroll = find(tree, (node) => node.type === 'ScrollView');
        assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
        assert.ok(find(scroll, (node) => node.type === 'TextInput'));
        assert.ok(
            find(
                tree,
                (node) =>
                    node.props?.testID === 'contribute-next-changeset-button',
            ),
        );
    });
}

test('Duo preview shows all references in a vertical gallery inside its compact card', () => {
    const form = createForm({ preset: 'flock' }, 'ios', true);
    try {
        form.element('contribute-preset-axon').props.onLongPress();
        const gallery = form.element('contribute-reference-gallery');
        assert.equal(gallery.props.horizontal, undefined);
        assert.equal(gallery.props.pagingEnabled, undefined);
        assert.equal(
            gallery.props.children[1].length,
            cameraManufacturers.CAMERA_MANUFACTURERS.find(
                ({ value }) => value === 'axon',
            ).referenceImages.length,
        );
        gallery.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
        assert.ok(
            form
                .element('contribute-reference-gallery')
                .props.children[1].every(
                    ({ props }) => props.style.width === 320,
                ),
        );
        assert.match(
            form.element('contribute-preset-preview').props.children.props
                .className,
            /max-w-\[360px\]/,
        );
    } finally {
        form.cleanup();
    }
});

test('camera content resolves to the design 16px padding and 20px section spacing', async () => {
    const require = createRequire(import.meta.url);
    const form = createForm({ preset: 'flock' }, 'ios', true);
    try {
        const className =
            form.type('ScrollView').props.children.props.className;
        const css = await require('postcss')([
            require('tailwindcss')({
                ...require('../../../tailwind.config.js'),
                content: [
                    {
                        raw: readFileSync(
                            new URL(
                                '../../contribute/camera-form.js',
                                import.meta.url,
                            ),
                            'utf8',
                        ),
                    },
                ],
            }),
        ]).process('@tailwind utilities;', { from: undefined });
        const compiled =
            require('react-native-css-interop/css-to-rn').cssToReactNativeRuntime(
                css.css,
                { inlineRem: 14 },
            );
        const style = Object.assign(
            {},
            ...className
                .split(/\s+/)
                .flatMap((name) =>
                    (compiled.rules[name]?.n ?? []).flatMap((rule) =>
                        (rule.d ?? [])
                            .filter((d) => d.length === 1)
                            .map((d) => d[0]),
                    ),
                ),
        );
        assert.equal(style.padding, 16);
        assert.equal(style.rowGap, 20);
        assert.equal(style.columnGap, 20);
    } finally {
        form.cleanup();
    }
});

test('camera form coordinates and save footer use full-width safe-area bands', () => {
    const form = createForm({ preset: 'flock' }, 'ios', true);
    try {
        for (const id of [
            'contribute-camera-coordinate-header',
            'contribute-camera-footer',
        ]) {
            const band = form.element(id);
            assert.equal(band.type, 'FullWidthSafeAreaBand');
            assert.equal(band.props.gutter, 16);
        }
    } finally {
        form.cleanup();
    }
});

test('iPad preset preview stays centered in a readable 420px card', () => {
    const form = createForm({ preset: 'flock' }, 'ios', false, true);
    try {
        form.element('contribute-preset-axon').props.onLongPress();
        const preview = form.element('contribute-preset-preview');
        assert.match(preview.props.className, /items-center/);
        assert.match(preview.props.children.props.className, /max-w-\[420px\]/);
        assert.equal(form.pin.details.preset, 'flock');
        form.element('contribute-brand-preview-close').props.onPress();
        assert.equal(form.element('contribute-preset-preview'), null);
    } finally {
        form.cleanup();
    }
});
