import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const mapSearchOverlaySource = readFileSync(
    new URL('../map-search-overlay.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);

describe('map search overlay', () => {
    test('matches the Android reference search bar dimensions and accessories', () => {
        const mainSearchRow = mapSearchOverlaySource.slice(
            mapSearchOverlaySource.indexOf('{!searchModeIsDirections ? ('),
            mapSearchOverlaySource.indexOf('</SearchGlassShell>'),
        );

        assert.match(mainSearchRow, /h-\[52px\].*gap-1 pl-3\.5 pr-1\.5/);
        assert.equal(
            (mainSearchRow.match(/h-9 w-9 shrink-0/g) ?? []).length,
            4,
        );
        assert.match(
            mainSearchRow,
            /min-w-0 flex-1 flex-row items-center gap-1 pl-0\.5/,
        );
        assert.match(mainSearchRow, /h-6 w-px shrink-0/);
        assert.match(mainSearchRow, /height: 36/);
        assert.doesNotMatch(mainSearchRow, /\{searchIsFocused \? \(/);
        assert.match(mainSearchRow, /name="mic"\s+size=\{20\}/);
        assert.match(mainSearchRow, /name="search"\s+size=\{18\}/);
        assert.match(mainSearchRow, /numberOfLines=\{1\}/);
        assert.match(mainSearchRow, /onPress=\{handleDrawerPress\}/);
        assert.match(mainSearchRow, /: handleDirectionsModePress/);
    });

    test('sizes the directions row from its full field column', () => {
        assert.match(
            mapSearchOverlaySource,
            /className="flex-row items-start gap-2\.5"[\s\S]*?className="relative w-3 self-stretch"[\s\S]*?directionsStopIsVisible[\s\S]*?'min-h-\[148px\]'[\s\S]*?'min-h-24'[\s\S]*?map-directions-destination-input-/,
        );
        assert.doesNotMatch(
            mapSearchOverlaySource,
            /className="flex-row items-stretch gap-2\.5"/,
        );
    });

    test('places map controls below the runtime top safe-area inset', () => {
        assert.match(
            mapScreenSource,
            /className="absolute inset-0 z-40"[\s\S]*?paddingLeft: safeAreaInsets\.left \+ 12[\s\S]*?paddingRight: safeAreaInsets\.right \+ 12[\s\S]*?paddingTop:\s*safeAreaInsets\.top \+\s*\(Platform\.isPad \? 36 : 12\)/,
        );
        assert.doesNotMatch(mapScreenSource, /NativeWindSafeAreaView/);
    });
});

test('search menu registers in the Duo navigation group and preserves its drawer handler', async () => {
    const { loadTourModule } = await import('./tour-test-helpers.mjs');
    let presses = 0;
    const handleDrawerPress = () => presses++;
    const { MapSearchOverlay } = loadTourModule(
        new URL('../map-search-overlay.js', import.meta.url),
        {
            '../design-system/duo-typography': {
                DuoText: 'Text',
                DuoTextInput: 'Input',
            },
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeAction',
            },
            '../root/duo-device-context': { useDuoDevice: () => true },
            './duo-bottom-sheet-layout': { getDuoPaneLayout: () => null },
            'react-native': {
                View: 'View',
                Pressable: 'Pressable',
                useWindowDimensions: () => ({ width: 500, height: 800 }),
            },
            'react-native-reanimated': { default: { View: 'AnimatedView' } },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': {
                DafButton: 'Button',
                DafChip: 'Chip',
            },
            './advanced-route-settings-controls': {},
            './destination-category-pills': {},
            './directions': { DIRECTIONS_MODE_DIRECTIONS: 'directions' },
            './directions-field': {},
            './duo-rail-icons': {
                getDuoRailIcon: (symbol) => ({
                    type: 'templateSource',
                    templateSource: symbol,
                }),
            },
            './layout-animations': {},
            './map-screen-context': {
                useMapSearchContext: () => ({
                    handleDrawerPress,
                    searchMode: 'search',
                    searchSource: 'map',
                    mapPreferencesAreLoaded: true,
                    submittedSearchResults: [],
                    insets: {},
                }),
            },
            './search-glass-shell': { SearchGlassShell: 'Shell' },
        },
    );
    const visit = (node) => {
        if (!node || typeof node !== 'object') return [];
        if (Array.isArray(node)) return node.flatMap(visit);
        return [node, ...visit(node.props?.children)];
    };
    const nodes = visit(MapSearchOverlay({ showDestinationCategories: false }));
    const button = nodes.find(
        (node) => node.props?.testID === 'map-search-drawer-button-map',
    );
    const native = nodes.find(
        (node) =>
            node.type === 'NativeAction' && node.props.children === button,
    );
    assert.equal(native.props.railOnly, true);
    assert.equal(native.props.kind, 'tool');
    assert.equal(native.props.group, 'navigation');
    assert.equal(native.props.visibilityPriority, 'high');
    assert.equal(native.props.symbol, 'line.3.horizontal');
    assert.equal(native.props.icon.templateSource, 'line.3.horizontal');
    assert.equal(button.props.onPress, handleDrawerPress);
    button.props.onPress();
    assert.equal(presses, 1);
});

test('native search glass keeps its tint and content without a transparent layer shadow', async () => {
    const { loadTourModule } = await import('./tour-test-helpers.mjs');
    const { SearchGlassShell } = loadTourModule(
        new URL('../search-glass-shell.js', import.meta.url),
        {
            'react-native': { View: 'View' },
            'react-native-reanimated': { default: { View: 'AnimatedView' } },
            './layout-animations': {},
            './map-liquid-glass': { mapLiquidGlassIsAvailable: () => true },
            './native-components': { NativeWindGlassView: 'Glass' },
        },
    );
    const shell = SearchGlassShell({
        searchSource: 'map',
        searchGlassTintColor: 'white',
        children: 'content',
    });
    const glass = shell.props.children;
    assert.doesNotMatch(glass.props.className, /shadow-/);
    assert.equal(glass.props.tintColor, 'white');
    assert.equal(glass.props.children.props.children, 'content');
});
