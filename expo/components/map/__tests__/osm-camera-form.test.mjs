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
function createForm(details) {
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
            '../../lib/osm/camera-manufacturers': cameraManufacturers,
            'react-native': {
                Image: Object.assign(function Image() {}, {
                    resolveAssetSource: (source) =>
                        source === 'bundled:axon-1.webp'
                            ? { width: 1200, height: 600 }
                            : source === 'bundled:axon-2.webp'
                              ? { width: 600, height: 1200 }
                              : { width: 1200, height: 900 },
                }),
                Modal: 'Modal',
                Platform: { OS: 'android', Version: 36 },
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                Text: 'Text',
                View: 'View',
                useColorScheme: () => 'light',
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

test('opening a new camera waits until the returned pin is committed to shared state', async () => {
    const hooks = createHookHarness();
    const routes = [];
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
        addPinAtCoordinate: () => pin,
        tour: { dismissPhase() {}, dismissStep() {} },
    };
    const { ContributePlacementSheet } = loadTourModule(
        new URL(
            '../../contribute/contribute-placement-sheet.js',
            import.meta.url,
        ),
        {
            react: hooks.react,
            'react-native': {
                Pressable: 'Pressable',
                Text: 'Text',
                View: 'View',
                useWindowDimensions: () => ({ height: 800 }),
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
            './contribute-tour-overlay': { ContributeTourOverlay: 'Overlay' },
        },
    );
    const render = () =>
        hooks.render(() =>
            ContributePlacementSheet({
                insets: { bottom: 10 },
                mapPreferencesAreLoaded: true,
                screenIsFocused: true,
                tourTargets: { current: {} },
                locationController: {
                    mapViewRef: {
                        current: { getCenter: async () => [-97, 30] },
                    },
                },
            }),
        );
    try {
        await find(
            render(),
            (node) => node.props?.testID === 'contribute-add-camera-button',
        ).props.onPress();
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
                    node.props?.testID === 'contribute-placement-sheet-title',
            ),
            'staged changes automatically expand the list',
        );
        assert.equal(
            find(
                render(),
                (node) => node.props?.testID === 'contribute-add-camera-button',
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
