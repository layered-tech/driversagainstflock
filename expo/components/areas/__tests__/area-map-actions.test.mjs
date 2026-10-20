import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

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
            useColorScheme: () => 'light',
            ...Object.fromEntries(
                ['Pressable', 'RefreshControl', 'ScrollView', 'View'].map(
                    (name) => [name, name],
                ),
            ),
        },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
        },
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
            elements(tree, 'View').some(
                (element) => element.props.testID === 'area-feed-footer',
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
