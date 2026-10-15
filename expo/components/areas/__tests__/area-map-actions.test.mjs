import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function renderScreen(file, payload, detail = false, overrides = {}) {
    const routes = [];
    let stateIndex = 0;
    const modules = {
        react: {
            useEffect() {},
            useRef: () => ({ current: null }),
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
        'react-native': Object.fromEntries(
            ['Pressable', 'RefreshControl', 'ScrollView', 'View'].map(
                (name) => [name, name],
            ),
        ),
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
        './areas-context': { useAreas: () => ({ markRead() {} }) },
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
    return { tree: module.exports.default(), routes };
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
            (element) => element.props.icon === 'map',
        );
        assert.ok(
            button,
            'The area map action must be available even without changes',
        );
        assert.equal(
            [].concat(button.props.children).join(''),
            total ? 'Show all 1 on the map' : 'View area on map',
        );
        button.props.onPress();
        assert.deepEqual(routes, ['/areas/2/map?window=7']);
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
            elements(tree, 'AreaText')[0].props.children,
            'Saved city',
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
