import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { areaCameraCones } from '../area-camera-cones.js';
import { getDuoPaneLayout } from '../../map/duo-bottom-sheet-layout.js';
import { getTabletPaneLayout } from '../../map/responsive-map-layout.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function renderScreen(
    file,
    payload,
    detail = false,
    overrides = {},
    exportName = 'default',
    props = {},
) {
    const routes = [];
    let stateIndex = 0;
    const modules = {
        react: {
            useEffect() {},
            useRef: () => ({ current: null }),
            useMemo: (calculate) => calculate(),
            useState: (initial) => [
                detail && stateIndex++ === 0 ? payload : initial,
                () => {},
            ],
        },
        'react/jsx-runtime': require('react/jsx-runtime'),
        'expo-router': {
            router: { push: (route) => routes.push(route) },
            useLocalSearchParams: () => ({ areaId: '2', changeId: '3' }),
        },
        'react-native': {
            Platform: { isPad: false },
            useColorScheme: () => 'light',
            useWindowDimensions: () => ({ width: 466, height: 678 }),
            ...Object.fromEntries(
                ['Pressable', 'RefreshControl', 'ScrollView', 'View'].map(
                    (name) => [name, name],
                ),
            ),
        },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
        },
        '../root/native-navigation': {
            FullWidthSafeAreaBand: 'FullWidthSafeAreaBand',
            NativeNavigationAction: 'NativeNavigationAction',
            useDuoRailEdge: () => null,
        },
        '../map/camera-state': { getBoundsFitCameraStop: () => null },
        '../root/duo-pane-screen': { DuoPaneMap: 'DuoPaneMap' },
        '../root/duo-pane-content-size': { useDuoPaneContentSize: () => ({}) },
        '../root/duo-device-context': { useDuoDevice: () => false },
        '../map/duo-bottom-sheet-layout': { getDuoPaneLayout },
        '../map/responsive-map-layout': { getTabletPaneLayout },
        './area-typography': { areaTextClassName: (value) => value },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': { DafIconButton: 'DafIconButton' },
        './area-geometry': { AREA_KINDS: { drawn: 'Drawn' } },
        './area-ui': Object.fromEntries(
            [
                'AreaText',
                'AreaButton',
                'AreaBadge',
                'AreaSegmentedControl',
                'AreaError',
                'AreaHeader',
                'AreaLoading',
                'AreaSheet',
            ].map((name) => [name, name]),
        ),
        './area-map': { AreaMap: 'AreaMap' },
        './area-camera-cones': { areaCameraCones },
        './areas-api': {},
        './areas-context': { useAreas: () => ({ areas: [], markRead() {} }) },
        './use-area-feed': { useAreaFeed: () => ({ payload, loading: false }) },
        ...overrides,
    };
    const code = transformSync(
        readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
        {
            configFile: false,
            babelrc: false,
            plugins: [
                [
                    require('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    ).code;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (name) => {
            assert.ok(name in modules, `Unexpected dependency ${name}`);
            return modules[name];
        },
        module,
        module.exports,
    );
    return { tree: module.exports[exportName](props), routes };
}

function elements(tree, type) {
    if (Array.isArray(tree))
        return tree.flatMap((child) => elements(child, type));
    if (!tree || typeof tree !== 'object') return [];
    return [
        ...(tree.type === type ? [tree] : []),
        ...elements(tree.props?.children, type),
    ];
}

test('area overlays remain visible under night lighting and fade removed camera dots', () => {
    const { tree } = renderScreen(
        'area-map.js',
        null,
        false,
        {
            '@rnmapbox/maps': Object.fromEntries(
                [
                    'StyleImport',
                    'Camera',
                    'ShapeSource',
                    'FillLayer',
                    'LineLayer',
                    'CircleLayer',
                    'SymbolLayer',
                ].map((name) => [name, name]),
            ),
            '../map/native-components': { NativeWindMapView: 'MapView' },
            '../map/config': { MAPBOX_ACCESS_TOKEN: 'test' },
            './area-geometry': { geometryBounds: () => [-88, 43, -87, 44] },
            './area-map-camera': { areaCameraSettings: () => ({}) },
        },
        'AreaMap',
        { overview: true, geometry: { type: 'Polygon', coordinates: [] } },
    );
    for (const [type, property] of [
        ['CircleLayer', 'circleEmissiveStrength'],
        ['LineLayer', 'lineEmissiveStrength'],
        ['FillLayer', 'fillEmissiveStrength'],
    ]) {
        const layers = elements(tree, type);
        assert.ok(layers.length);
        for (const layer of layers)
            assert.equal(layer.props.style[property], 1);
    }
    const markers = elements(tree, 'CircleLayer').find(
        (layer) => layer.props.id === 'area-change-circles',
    );
    assert.deepEqual(
        elements(tree, 'CircleLayer').map((layer) => layer.props.id),
        ['area-change-halos', 'area-change-circles'],
    );
    assert.equal(
        elements(tree, 'SymbolLayer').length,
        0,
        'Node markers have no floating plus/minus badges',
    );
    assert.deepEqual(markers.props.style.circleOpacity, [
        'match',
        ['get', 'kind'],
        'removed',
        0.45,
        1,
    ]);
    assert.equal(
        elements(tree, 'LineLayer')[0].props.style.lineDasharray,
        undefined,
    );
});

test('area bounds are fitted again when the native map finishes resizing', () => {
    const target = {
        bounds: {
            ne: [-122, 38],
            sw: [-123, 37],
            paddingLeft: 360,
            paddingRight: 40,
            paddingTop: 40,
            paddingBottom: 40,
        },
    };
    const { tree } = renderScreen(
        'area-map.js',
        null,
        false,
        {
            '@rnmapbox/maps': Object.fromEntries(
                [
                    'StyleImport',
                    'Camera',
                    'ShapeSource',
                    'FillLayer',
                    'LineLayer',
                    'CircleLayer',
                ].map((name) => [name, name]),
            ),
            '../map/native-components': { NativeWindMapView: 'MapView' },
            '../map/config': { MAPBOX_ACCESS_TOKEN: 'test' },
            './area-geometry': { geometryBounds: () => [-123, 37, -122, 38] },
            './area-map-camera': { areaCameraSettings: () => target },
            '../root/duo-device-context': { useDuoDevice: () => true },
        },
        'AreaMap',
    );
    const calls = [];
    elements(tree, 'Camera')[0].props.ref.current = {
        setCamera: (settings) => calls.push(settings),
    };
    tree.props.onLayout({
        nativeEvent: { layout: { width: 678, height: 982 } },
    });
    assert.deepEqual(calls, [{ ...target, animationDuration: 0 }]);
});

test('area details show the selected list name before the feed loads and prefer fresh details', () => {
    const saved = {
        id: 2,
        name: 'Saved neighborhood',
        kind: 'drawn',
        camera_count: 4,
    };
    const fresh = { ...saved, name: 'Updated neighborhood', camera_count: 5 };
    for (const [payload, expected] of [
        [null, saved],
        [
            {
                area: fresh,
                counts: { added: 0, removed: 0 },
                changes: { data: [], total: 0 },
            },
            fresh,
        ],
    ]) {
        const { tree } = renderScreen('area-feed-screen.js', payload, false, {
            './areas-context': {
                useAreas: () => ({
                    areas: [{ id: 1, name: 'Different area' }, saved],
                    markRead() {},
                }),
            },
        });
        const header = elements(tree, 'AreaHeader')[0];
        assert.equal(header.props.title, expected.name);
        assert.equal(
            header.props.subtitle,
            `Drawn · ${expected.camera_count} cameras mapped`,
        );
        if (!payload) {
            assert.equal(
                elements(tree, 'View').some(
                    (element) => element.props.testID === 'area-feed-footer',
                ),
                false,
            );
        }
    }
});

test('area details retain a generic title for an unknown deep-linked area', () => {
    const { tree } = renderScreen('area-feed-screen.js', null);
    assert.equal(elements(tree, 'AreaHeader')[0].props.title, 'Area changes');
    assert.equal(elements(tree, 'AreaHeader')[0].props.subtitle, undefined);
});

for (const total of [0, 1]) {
    test(`area feeds with ${total} changes can open the area map`, () => {
        const records = total
            ? [
                  {
                      id: 3,
                      kind: 'added',
                      street: 'Main St',
                      operator: 'Camera',
                      changed_at: '2026-10-14T12:00:00Z',
                  },
              ]
            : [];
        const { tree, routes } = renderScreen('area-feed-screen.js', {
            area: { id: 2, name: 'Test area', kind: 'drawn', camera_count: 4 },
            counts: { added: total, removed: 0 },
            changes: { data: records, total, current_page: 1, last_page: 1 },
        });
        const button = elements(tree, 'AreaButton').find(
            (element) => element.props.testID === 'area-view-all-nodes',
        );
        assert.ok(
            button,
            'The area map action must be available even without changes',
        );
        assert.equal(button.props.variant, 'secondary');
        assert.equal(
            elements(elements(tree, 'ScrollView')[0], 'AreaButton').includes(
                button,
            ),
            false,
            'Map button stays outside the scrolling feed',
        );
        assert.ok(
            elements(tree, 'FullWidthSafeAreaBand').some(
                (element) =>
                    element.props.testID === 'area-feed-footer' &&
                    element.props.gutter === 16,
            ),
        );
        assert.equal(
            [].concat(button.props.children).join(''),
            'View Area on Map',
        );
        button.props.onPress();
        assert.deepEqual(routes, ['/areas/2/map?view=all']);
        const changesButton = elements(tree, 'AreaButton').find(
            (element) => element.props.testID === 'area-view-map',
        );
        assert.equal(Boolean(changesButton), Boolean(total));
        if (changesButton) {
            assert.equal(
                changesButton.props.children,
                'Show 1 change on the map',
            );
            changesButton.props.onPress();
            assert.equal(routes.at(-1), '/areas/2/map?window=7');
        }
        assert.equal(
            elements(tree, 'AreaText').some(
                (element) =>
                    element.props.children ===
                    'No camera changes in this time period.',
            ),
            total === 0,
        );
    });
}

test('camera detail shows its map without a redundant map navigation button', () => {
    const { tree } = renderScreen(
        'area-change-screen.js',
        {
            area: { name: 'Test area' },
            change: {
                id: 3,
                kind: 'added',
                longitude: -88,
                latitude: 43,
                changed_at: '2026-10-14T12:00:00Z',
            },
        },
        true,
    );
    assert.deepEqual(elements(tree, 'AreaMap')[0].props.center, [-88, 43]);
    assert.deepEqual(
        elements(tree, 'AreaButton').map((button) => button.props.children),
        ['OpenStreetMap ↗'],
    );
});

test('an area map uses its saved boundary before the change request finishes', () => {
    const saved = {
        id: 2,
        name: 'Saved city',
        geometry: {
            type: 'Polygon',
            coordinates: [
                [
                    [-88, 43],
                    [-87, 43],
                    [-87, 44],
                    [-88, 43],
                ],
            ],
        },
    };
    for (const areas of [
        { areas: [saved], cachedAreas: [] },
        { areas: [], cachedAreas: [saved] },
    ]) {
        const { tree } = renderScreen(
            'area-changes-map-screen.js',
            null,
            false,
            {
                'expo-router': {
                    router: {},
                    useLocalSearchParams: () => ({ areaId: '2' }),
                },
                './areas-context': {
                    useAreas: () => ({ ...areas, rememberAreaBoundary() {} }),
                },
            },
        );
        assert.equal(
            elements(tree, 'AreaMap')[0]?.props.geometry,
            saved.geometry,
        );
        assert.equal(
            elements(tree, 'AreaSheet')[0].props.subtitle,
            'Saved city · last 7 days',
        );
    }
});

test('an uncached area waits for its boundary rather than showing a world map', () => {
    const { tree } = renderScreen('area-changes-map-screen.js', null, false, {
        'expo-router': {
            router: {},
            useLocalSearchParams: () => ({ areaId: '2' }),
        },
        './areas-context': {
            useAreas: () => ({
                areas: [],
                cachedAreas: [],
                rememberAreaBoundary() {},
            }),
        },
    });
    assert.equal(elements(tree, 'AreaMap').length, 0);
    assert.ok(elements(tree, 'AreaLoading').length);
});

for (const allCameras of [false, true]) {
    test(
        allCameras
            ? 'the generic area map loads all current camera pages without change filters'
            : 'map filters reload every page, summarize both kinds, and keep camera detail navigation',
        async () => {
            const state = [];
            const requests = [];
            let cursor = 0;
            let effect;
            const saved = {
                id: 2,
                name: 'Test city',
                kind: 'city',
                geometry: { type: 'Polygon', coordinates: [] },
            };
            const records = [
                {
                    id: 3,
                    kind: allCameras ? 'current' : 'added',
                    longitude: -88,
                    latitude: 43,
                },
                {
                    id: 4,
                    kind: allCameras ? 'current' : 'removed',
                    longitude: -88.1,
                    latitude: 43.1,
                },
            ];
            const render = () => {
                cursor = 0;
                return renderScreen('area-changes-map-screen.js', null, false, {
                    react: {
                        useEffect(callback) {
                            effect = callback;
                        },
                        useState(initial) {
                            const index = cursor++;
                            if (!(index in state)) state[index] = initial;
                            return [
                                state[index],
                                (value) => {
                                    state[index] =
                                        typeof value === 'function'
                                            ? value(state[index])
                                            : value;
                                },
                            ];
                        },
                    },
                    'expo-router': {
                        router: { push: (route) => requests.push(route) },
                        useLocalSearchParams: () => ({
                            areaId: '2',
                            window: '30',
                            view: allCameras ? 'all' : undefined,
                        }),
                    },
                    './areas-context': {
                        useAreas: () => ({
                            areas: [saved],
                            cachedAreas: [],
                            rememberAreaBoundary() {},
                        }),
                    },
                    './areas-api': {
                        areaRequest: async (path) => {
                            requests.push(path);
                            const page = Number(
                                new URLSearchParams(path.split('?')[1]).get(
                                    'page',
                                ),
                            );
                            return {
                                area: saved,
                                [allCameras ? 'cameras' : 'changes']: {
                                    data: path.includes('window=24h')
                                        ? []
                                        : [records[page - 1]],
                                    last_page: path.includes('window=24h')
                                        ? 1
                                        : 2,
                                },
                            };
                        },
                    },
                    './area-geometry': {
                        mergeAreaChanges: (current, next) => [
                            ...current,
                            ...next,
                        ],
                    },
                });
            };
            render();
            const cleanup = effect();
            await new Promise(setImmediate);
            let { tree } = render();
            assert.deepEqual(
                requests,
                allCameras
                    ? ['/2/cameras?page=1', '/2/cameras?page=2']
                    : [
                          '/2/changes?window=30&page=1',
                          '/2/changes?window=30&page=2',
                      ],
            );
            assert.equal(
                elements(tree, 'AreaSheet')[0].props.title,
                allCameras ? '2 cameras on the map' : '2 changes on the map',
            );
            assert.equal(
                elements(tree, 'AreaSheet')[0].props.subtitle,
                allCameras
                    ? 'Test city · City limits'
                    : 'Test city · last 30 days',
            );
            assert.equal(elements(tree, 'AreaMap')[0].props.overview, true);
            assert.deepEqual(
                elements(tree, 'AreaMap')[0].props.changes,
                records,
            );
            if (allCameras) {
                assert.equal(elements(tree, 'AreaSegmentedControl').length, 0);
                assert.equal(
                    elements(tree, 'AreaMap')[0].props.onChangePress,
                    undefined,
                );
                return;
            }
            const countText = elements(tree, 'AreaText').filter(
                (node) => node.props.className === 'font-dafMono font-bold',
            );
            assert.deepEqual(
                countText.map((node) => node.props.children),
                [1, 1],
            );
            elements(tree, 'AreaMap')[0].props.onChangePress(4);
            assert.equal(requests.at(-1), '/areas/2/change?changeId=4');
            elements(tree, 'AreaSegmentedControl')[0].props.onChange('24h');
            cleanup();
            render();
            effect();
            await new Promise(setImmediate);
            ({ tree } = render());
            assert.equal(requests.at(-1), '/2/changes?window=24h&page=1');
            assert.equal(
                elements(tree, 'AreaSheet')[0].props.title,
                '0 changes on the map',
            );
            assert.equal(
                elements(tree, 'AreaSheet')[0].props.subtitle,
                'Test city · last 24 hours',
            );
            assert.deepEqual(elements(tree, 'AreaMap')[0].props.changes, []);
        },
    );
}

test('Duo fits a drawn boundary into the map beside its content pane after resizing', () => {
    const requests = [];
    const stops = [];
    const target = { centerCoordinate: [-97.74, 30.27], zoomLevel: 14 };
    const { tree } = renderScreen(
        'area-map.js',
        null,
        false,
        {
            '@rnmapbox/maps': {
                Camera: 'Camera',
                StyleImport: 'Import',
                ShapeSource: 'Source',
                FillLayer: 'Fill',
                LineLayer: 'Line',
                CircleLayer: 'Circle',
            },
            react: {
                useEffect() {},
                useRef: () => ({
                    current: { setCamera: (stop) => stops.push(stop) },
                }),
                useMemo: (fn) => fn(),
            },
            'react-native': {
                View: 'View',
                Text: 'Text',
                useWindowDimensions: () => ({ width: 982, height: 678 }),
                useColorScheme: () => 'light',
            },
            '../root/duo-device-context': { useDuoDevice: () => true },
            '../root/native-navigation': {
                FullWidthSafeAreaBand: 'FullWidthSafeAreaBand',
                useDuoRailEdge: () => 'trailing',
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({
                    left: 0,
                    right: 84,
                    top: 0,
                    bottom: 16,
                }),
            },
            '../map/native-components': { NativeWindMapView: 'Map' },
            '../map/config': { MAPBOX_ACCESS_TOKEN: 'test' },
            './area-geometry': { geometryBounds: () => [-98, 30, -97, 31] },
            './area-map-camera': {
                areaCameraSettings: ({ fitGeometry, insets }) =>
                    fitGeometry
                        ? {
                              bounds: {
                                  ne: [-97, 31],
                                  sw: [-98, 30],
                                  paddingTop: 40,
                                  paddingBottom: 40,
                                  paddingLeft: 40 + insets.left,
                                  paddingRight: 40 + insets.right,
                              },
                          }
                        : { centerCoordinate: [-97.5, 30.5], zoomLevel: 12 },
            },
            '../map/camera-state': {
                getBoundsFitCameraStop: (args) => {
                    requests.push(args);
                    return target;
                },
            },
        },
        'AreaMap',
        { geometry: { type: 'Polygon', coordinates: [] }, fitGeometry: false },
    );
    tree.props.onLayout();
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].padding, [40, 124, 40, 489]);
    assert.equal(requests[0].viewportWidth, 982);
    assert.equal(requests[0].viewportHeight, 678);
    assert.deepEqual(stops, [{ ...target, animationDuration: 0 }]);
});

test('My areas supplies every saved polygon to the open Duo map', () => {
    const ring = [
        [-97, 30],
        [-97, 31],
        [-98, 31],
        [-97, 30],
    ];
    const areas = [
        {
            id: 1,
            geometry: { type: 'Polygon', coordinates: [ring] },
            counts: { added: 0, removed: 0 },
        },
        {
            id: 2,
            geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] },
            counts: { added: 0, removed: 0 },
        },
        { id: 3, counts: { added: 0, removed: 0 } },
    ];
    const { tree } = renderScreen('areas-screen.js', null, false, {
        react: { useMemo: (fn) => fn(), useCallback: (fn) => fn() },
        'expo-router': { router: {}, useFocusEffect() {} },
        './area-geometry': { AREA_KINDS: {}, ALERT_MODES: [] },
        './areas-context': {
            useAreas: () => ({ areas, refresh() {}, timeWindow: '7' }),
        },
    });
    const portal = elements(tree, 'DuoPaneMap')[0];
    assert.deepEqual(portal.props.children.props.geometry, {
        type: 'MultiPolygon',
        coordinates: [[ring], [ring], [ring]],
    });
    assert.equal(portal.props.children.props.overview, true);
});

for (const device of [
    { name: 'iPad', isPad: true, duo: false, width: 1194, expectedWidth: 406 },
    {
        name: 'open Duo',
        isPad: false,
        duo: true,
        width: 982,
        expectedWidth: 467,
    },
    {
        name: 'phone',
        isPad: false,
        duo: false,
        width: 390,
        expectedWidth: null,
    },
]) {
    test(`area sheets use the ${device.name} layout without covering the map`, () => {
        const { tree } = renderScreen(
            'area-ui.js',
            null,
            false,
            {
                'react-native': {
                    Platform: { isPad: device.isPad },
                    View: 'View',
                    ScrollView: 'ScrollView',
                    useWindowDimensions: () => ({
                        width: device.width,
                        height: 834,
                    }),
                },
                '../root/duo-device-context': {
                    useDuoDevice: () => device.duo,
                },
                '../../lib/safe-area-insets': {
                    useSafeAreaInsets: () => ({
                        top: 42,
                        bottom: 20,
                        left: 0,
                        right: 0,
                    }),
                },
            },
            'AreaSheet',
            {
                title: 'Add an area',
                subtitle: 'Watch a place',
                trailing: 'Close',
            },
        );
        if (device.expectedWidth === null) {
            assert.equal(tree.props.style, undefined);
            assert.match(tree.props.className, /rounded-t-dafSheet/);
        } else {
            assert.equal(tree.props.style.top, 56);
            assert.equal(
                device.width -
                    tree.props.style.marginLeft -
                    tree.props.style.marginRight,
                device.expectedWidth,
            );
            assert.match(tree.props.className, /rounded-dafXl/);
            assert.equal(tree.props.style.bottom, undefined);
        }
        const scroll = elements(tree, 'ScrollView')[0];
        assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
        assert.ok(
            elements(tree, 'View').some((node) =>
                [].concat(node.props.children).includes('Close'),
            ),
        );
    });
}

test('tablet area maps reserve the left pane while fitting the real boundary', () => {
    let cameraInput;
    const { tree } = renderScreen(
        'area-map.js',
        null,
        false,
        {
            'react-native': {
                Platform: { isPad: true },
                View: 'View',
                Text: 'Text',
                useColorScheme: () => 'light',
                useWindowDimensions: () => ({ width: 1194, height: 834 }),
            },
            '@rnmapbox/maps': {
                Camera: 'Camera',
                StyleImport: 'StyleImport',
                ShapeSource: 'ShapeSource',
                FillLayer: 'FillLayer',
                LineLayer: 'LineLayer',
                CircleLayer: 'CircleLayer',
            },
            '../map/native-components': { NativeWindMapView: 'MapView' },
            '../map/config': { MAPBOX_ACCESS_TOKEN: 'test' },
            './area-geometry': { geometryBounds: () => [-123, 37, -122, 38] },
            './area-map-camera': {
                areaCameraSettings: (input) => {
                    cameraInput = input;
                    return { centerCoordinate: [-122.5, 37.5] };
                },
            },
        },
        'AreaMap',
        { geometry: { type: 'Polygon', coordinates: [] } },
    );
    assert.equal(cameraInput.insets.left, 430);
    assert.equal(cameraInput.bottomInset, 0);
    assert.equal(tree.props.logoPosition.left, 430);
    assert.equal(typeof tree.props.onLayout, 'function');
});
