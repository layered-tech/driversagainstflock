import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
    getDuoContentPaneHeight,
    getDuoPaneLayout,
} from '../duo-bottom-sheet-layout.js';
import { loadTourModule } from './tour-test-helpers.mjs';

const require = createRequire(import.meta.url);
const css = await require('postcss')([
    require('tailwindcss')({
        ...require('../../../tailwind.config.js'),
        content: [
            {
                raw: readFileSync(
                    new URL('../../root/duo-pane-screen.js', import.meta.url),
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
const hasVariableHost = (classes) =>
    classes.split(/\s+/).some((name) => compiled.rules[name]?.variables);

test('Duo page routes share a half-width content pane and preserve the live map across folding', () => {
    let duo = true;
    let tablet = false;
    let width = 982;
    let insets = { top: 0, bottom: 50, left: 0, right: 84 };
    let registeredMap = null;
    const cleanup = [];
    const setMap = (next) => {
        registeredMap = typeof next === 'function' ? next(registeredMap) : next;
    };
    const { DuoPaneScreen, DuoPaneMap, DuoMapModalScreen } = loadTourModule(
        new URL('../../root/duo-pane-screen.js', import.meta.url),
        {
            react: {
                useMemo: (calculate) => calculate(),
                createContext: () => ({ Provider: 'MapContext' }),
                useState: (initial) =>
                    initial === null
                        ? [registeredMap, setMap]
                        : [initial, () => {}],
                useContext: () => setMap,
                useLayoutEffect: (effect) => cleanup.push(effect()),
            },
            'react-native': {
                Platform: {
                    get isPad() {
                        return tablet;
                    },
                },
                View: 'View',
                useWindowDimensions: () => ({ width }),
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => insets,
                SafeAreaInsetsOverrideProvider: 'Insets',
            },
            '../areas/area-map': { AreaMap: 'Map' },
            '../map/duo-bottom-sheet-layout': {
                getDuoPaneLayout,
                getDuoContentPaneHeight,
            },
            '../map/shared-map-state': {
                useSharedMapLocationState: () => ({
                    userLocation: { longitude: -122, latitude: 37 },
                }),
                useSharedMapState: () => ({
                    markerPoints: [
                        {
                            id: 1,
                            geometry: {
                                type: 'Point',
                                coordinates: [-122, 37],
                            },
                        },
                        {
                            id: 2,
                            geometry: {
                                type: 'Point',
                                coordinates: [null, null],
                            },
                        },
                    ],
                }),
            },
            './duo-device-context': {
                useDuoDevice: () => duo,
                DuoPaneContentContext: { Provider: 'PaneContext' },
                DuoPaneSizeContext: { Provider: 'SizeContext' },
            },
            './native-navigation': { HorizontalSafeAreaContent: 'SafeContent' },
        },
    );
    const modalScene = DuoMapModalScreen({ children: 'delete-sheet' });
    assert.equal(modalScene.props.testID, 'duo-map-modal-screen');
    assert.equal(modalScene.props.children[1], 'delete-sheet');
    assert.match(
        modalScene.props.children[0].props.className,
        /absolute inset-0/,
    );
    for (const nextWidth of [982, 1180]) {
        width = nextWidth;
        const tree = DuoPaneScreen({ children: 'page' });
        assert.equal(tree.props.testID, 'duo-split-screen');
        const [mapHost, pane] = tree.props.children;
        const map = mapHost.props.children.type();
        assert.equal(map.type, 'Map');
        assert.deepEqual(map.props.center, [-122, 37]);
        assert.equal(map.props.changes[0].id, 1);
        assert.deepEqual(map.props.changes, [
            { id: 1, longitude: -122, latitude: 37 },
        ]);
        assert.equal(
            pane.props.style.width,
            Math.floor((width - insets.right) / 2) - 24,
        );
        assert.equal(pane.props.style.top, insets.top + 14);
        assert.equal(
            pane.props.children.props.children.props.children.props.children
                .props.children.props.children,
            'page',
        );
        assert.deepEqual(pane.props.children.props.insets, {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
        });
    }
    const firstMap = { type: 'Selected area' };
    const nextMap = { type: 'Next selected area' };
    DuoPaneMap({ children: firstMap });
    DuoPaneMap({ children: nextMap });
    cleanup[0]();
    assert.equal(
        DuoPaneScreen({ children: 'page' }).props.children[0].props.children,
        nextMap,
    );
    cleanup[1]();
    assert.notEqual(
        DuoPaneScreen({ children: 'page' }).props.children[0].props.children,
        nextMap,
    );
    width = 678;
    insets = { ...insets, top: 44, right: 0 };
    const portrait = DuoPaneScreen({ children: 'page' });
    assert.equal(portrait.props.testID, 'duo-page-screen');
    assert.equal(portrait.props.children[1].props.style, undefined);
    assert.equal(portrait.props.children[0].props.children, null);
    width = 466;
    const closed = DuoPaneScreen({ children: 'page' });
    const closedPath = [];
    let closedPage = closed.props.children[1];
    while (closedPage && typeof closedPage === 'object') {
        closedPath.push(closedPage.type);
        closedPage = closedPage.props.children;
    }
    width = 982;
    const openPath = [];
    let openPage = DuoPaneScreen({ children: 'page' }).props.children[1];
    while (openPage && typeof openPage === 'object') {
        openPath.push(openPage.type);
        openPage = openPage.props.children;
    }
    assert.deepEqual(
        openPath,
        closedPath,
        'folding preserves the page ancestry and component state',
    );
    assert.equal(closedPage, 'page');
    assert.equal(closed.props.testID, 'duo-page-screen');
    assert.ok(
        hasVariableHost(closed.props.children[1].props.className),
        'NativeWind must establish its variable provider before the first fold',
    );
    assert.ok(
        hasVariableHost(
            DuoPaneScreen({ children: 'page' }).props.children[1].props
                .className,
        ),
    );
    width = 982;
    duo = false;
    assert.equal(DuoPaneScreen({ children: 'page' }).type, 'SafeContent');
    tablet = true;
    width = 1194;
    const iPad = DuoPaneScreen({ children: 'page' });
    assert.equal(iPad.props.testID, 'tablet-split-screen');
    assert.equal(iPad.props.children[1].props.style.width, 406);
    assert.equal(iPad.props.children[1].props.testID, 'tablet-content-pane');
});

test('Scorecard registers its menu as a native rail tool and retains its drawer action', () => {
    const calls = [];
    const { ScorecardScreenHeader } = loadTourModule(
        new URL('../../scorecard/scorecard-screen-header.js', import.meta.url),
        {
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeAction',
                FullWidthSafeAreaBand: 'Band',
                useDuoRailEdge: () => 'trailing',
            },
            'expo-router': { router: {}, useNavigation: () => 'navigation' },
            'react-native': {
                Platform: { OS: 'ios' },
                Pressable: 'Button',
                View: 'View',
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ top: 0 }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/tokens': {
                dafSemanticColors: { speedOk: '#1FBF6B' },
            },
            '../map/navigation': {
                toggleNearestDrawer: (navigation) => calls.push(navigation),
            },
        },
    );
    const action = ScorecardScreenHeader({ title: 'Scorecard' }).props
        .children[0];
    assert.equal(action.type, 'NativeAction');
    assert.equal(action.props.kind, 'tool');
    assert.equal(action.props.symbol, 'line.3.horizontal');
    assert.equal(action.props.railOnly, true);
    assert.notEqual(action.props.native, false);
    action.props.children.props.onPress();
    assert.deepEqual(calls, ['navigation']);
});

test('every full-page Fold flow selects the shared Duo pane while map detail routes retain their own map sheets', () => {
    const mocks = {
        ...Object.fromEntries(
            [
                'HankenGrotesk-Regular',
                'HankenGrotesk-Medium',
                'HankenGrotesk-SemiBold',
                'HankenGrotesk-Bold',
                'Geist-Bold',
                'JetBrainsMono-Regular',
                'JetBrainsMono-SemiBold',
                'JetBrainsMono-Bold',
            ].map((font) => [`../../assets/fonts/${font}.ttf`, font]),
        ),
        'expo-router/stack': { Stack: 'Stack' },
        '../../components/root/duo-pane-screen': {
            DuoPaneScreen: 'DuoPaneScreen',
            duoPaneScreenLayout: ({ children }) => ({
                type: 'DuoPaneScreen',
                props: { children },
            }),
        },
        'expo-font': { useFonts: () => [true, null] },
        'react-native': { View: 'View', useColorScheme: () => 'light' },
        '../../components/design-system/tokens': {
            getDafTheme: () => ({ surface: { page: '#F5F7F9' } }),
        },
    };
    for (const [folder, routes, ownsMap] of [
        ['scorecard', ['index', 'timeline'], ['event/[eventId]', 'trail']],
        [
            'areas',
            ['index', '[areaId]/index', '[areaId]/alerts'],
            ['add', '[areaId]/map'],
        ],
        [
            'contribute',
            ['camera/[index]', 'changeset', 'review', 'published'],
            [],
        ],
        ['edits', ['index', '[nodeId]'], []],
    ]) {
        const { default: Layout } = loadTourModule(
            new URL(`../../../app/${folder}/_layout.js`, import.meta.url),
            mocks,
        );
        const root = Layout();
        const stack = root.type === 'Stack' ? root : root.props.children;
        for (const route of routes) {
            const screen = stack.props.screenLayout({
                children: 'screen',
                route: { name: route },
            });
            assert.equal(screen.type, 'DuoPaneScreen', `${folder}/${route}`);
        }
        for (const route of ownsMap) {
            assert.equal(
                stack.props.screenLayout({
                    children: 'map screen',
                    route: { name: route },
                }),
                'map screen',
            );
        }
    }
});

test('content-sized panes measure header, intrinsic scroll content and footer before shrinking', () => {
    let size = { header: null, content: null, footer: null };
    const { useDuoPaneContentSize } = loadTourModule(
        new URL('../../root/duo-pane-content-size.js', import.meta.url),
        {
            react: {
                useCallback: (callback) => callback,
                useContext: () => (update) => {
                    size = update(size);
                },
                useLayoutEffect: (effect) => effect(),
            },
            './duo-device-context': { DuoPaneSizeContext: 'Size' },
        },
    );
    const sizing = useDuoPaneContentSize();
    assert.equal(getDuoContentPaneHeight(size, 640), null);
    sizing.onHeaderLayout({ nativeEvent: { layout: { height: 52 } } });
    sizing.onContentSizeChange(425, 380);
    sizing.onFooterLayout({ nativeEvent: { layout: { height: 88 } } });
    assert.equal(getDuoContentPaneHeight(size, 640), 522);
    sizing.onContentSizeChange(425, 1200);
    assert.equal(
        getDuoContentPaneHeight(size, 640),
        640,
        'long content remains scrollable inside the available safe area',
    );
    useDuoPaneContentSize({ header: false });
    assert.equal(size.header, 0, 'published pages need no empty header');
    useDuoPaneContentSize({ footer: false });
    assert.equal(
        size.footer,
        0,
        'timeline panes size to their header and scroll content without a footer',
    );
});
