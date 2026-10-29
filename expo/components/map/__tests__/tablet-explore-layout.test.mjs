import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

const insets = { top: 24, bottom: 20, left: 0, right: 0 };
const flatten = (node) =>
    !node || typeof node !== 'object'
        ? []
        : Array.isArray(node)
          ? node.flatMap(flatten)
          : [node, ...flatten(node.props?.children)];

function modules({
    isPad,
    duo = false,
    width = 1194,
    searchMode = 'search',
    searchPageIsVisible = false,
} = {}) {
    const context = {
        insets,
        mapPreferencesAreLoaded: true,
        searchMode,
        searchPageIsVisible,
        directionsSearchPageIsVisible: searchPageIsVisible,
        searchSource: 'tablet',
        searchValue: '',
        trimmedSearchValue: '',
        directionsTrimmedSearchValue: '',
        searchFavoriteLocations: [],
        searchRecentLocations: [],
        favoriteLocations: [],
        recentLocations: [],
        submittedSearchResults: [],
    };
    const mocks = {
        'react-native': {
            Platform: { OS: 'ios', isPad },
            ActivityIndicator: 'Indicator',
            Pressable: 'Pressable',
            ScrollView: 'ScrollView',
            View: 'View',
            KeyboardAvoidingView: 'KeyboardAvoidingView',
            useWindowDimensions: () => ({ width, height: 834 }),
        },
        'react-native-reanimated': {
            __esModule: true,
            default: { View: 'AnimatedView' },
        },
        '../root/duo-device-context': { useDuoDevice: () => duo },
        '../root/native-navigation': { NativeNavigationAction: 'NativeAction' },
        '../../lib/safe-area-insets': { useSafeAreaInsets: () => insets },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': { DafButton: 'Button', DafChip: 'Chip' },
        './advanced-route-settings-controls': {
            AdvancedRouteSettings: 'Settings',
        },
        './destination-category-pills': {
            DestinationCategoryPills: 'Categories',
        },
        './directions': { DIRECTIONS_MODE_DIRECTIONS: 'directions' },
        './directions-field': { DirectionsField: 'Field' },
        './directions-current-location-option': {},
        './google-results-footer': {},
        './place-search-result-row': {},
        './primary-location-cards': {},
        './primary-locations': {},
        './saved-location-section': {},
        './submitted-search-result-row': {},
        './duo-rail-icons': { getDuoRailIcon: () => undefined },
        './layout-animations': {},
        './search-glass-shell': { SearchGlassShell: 'Shell' },
        './map-screen-context': { useMapSearchContext: () => context },
    };
    return {
        ...loadTourModule(
            new URL('../map-search-overlay.js', import.meta.url),
            mocks,
        ),
        ...loadTourModule(
            new URL('../map-full-screen-search.js', import.meta.url),
            mocks,
        ),
    };
}

test('iPad search and categories use the design pane while controls stay at the map edge', () => {
    const { MapSearchOverlay } = modules({ isPad: true });
    const controls = { type: 'MapControls', props: {} };
    const nodes = flatten(MapSearchOverlay({ mapControls: controls }));
    const pane = nodes.find(
        (node) =>
            node.type === 'AnimatedView' && node.props.style?.width === 406,
    );
    assert.ok(pane);
    const rail = nodes.find(
        (node) => node.props.testID === 'tablet-map-control-rail',
    );
    assert.equal(rail.props.children, controls);
    assert.equal(rail.props.style.top, 60);
    assert.equal(rail.props.style.right, 12);
    assert.equal(
        nodes.find((node) => node.type === 'Categories').props.compact,
        true,
    );
});

test('phone and Duo search retain their established geometry', () => {
    for (const device of [
        { isPad: false, width: 390 },
        { isPad: false, width: 1194 },
        { isPad: false, duo: true, width: 982 },
    ]) {
        const { MapSearchOverlay } = modules(device);
        const nodes = flatten(MapSearchOverlay({ mapControls: 'controls' }));
        assert.equal(
            nodes.some(
                (node) => node.props.testID === 'tablet-map-control-rail',
            ),
            false,
        );
        const shell = nodes.find((node) => node.type === 'AnimatedView');
        assert.equal(shell.props.style?.width, device.duo ? 467 : undefined);
    }
});

test('tablet search, saved-address setup, and directions lookup keep a bounded scrollable pane', () => {
    for (const searchMode of ['search', 'directions']) {
        const { MapFullScreenSearch } = modules({
            isPad: true,
            searchMode,
            searchPageIsVisible: true,
        });
        const tree = MapFullScreenSearch();
        assert.equal(tree.props.style.left, 12);
        assert.equal(tree.props.style.right, 776);
        assert.equal(tree.props.style.top, 56);
        assert.equal(tree.props.style.maxHeight, 758);
        assert.equal(tree.props.behavior, 'padding');
        assert.ok(
            flatten(tree).some(
                (node) =>
                    node.type === 'ScrollView' &&
                    node.props.keyboardShouldPersistTaps === 'handled',
            ),
        );
    }
});

test('tablet directions submit stays inside its pane instead of across the bottom of the map', () => {
    const { MapSearchOverlay } = modules({
        isPad: true,
        searchMode: 'directions',
    });
    const nodes = flatten(MapSearchOverlay({}));
    const submit = nodes.filter(
        (node) => node.props.testID === 'map-directions-submit-button-tablet',
    );
    assert.equal(submit.length, 1);
    const scroll = nodes.find((node) => node.type === 'ScrollView');
    assert.ok(flatten(scroll).includes(submit[0]));
});

test('tablet camera framing clears the fixed pane rather than excluding half the screen', () => {
    const { useMapCameraPadding } = loadTourModule(
        new URL('../camera-focus-padding.js', import.meta.url),
        {
            react: { useMemo: (fn) => fn() },
            'react-native': { Platform: { OS: 'ios', isPad: true } },
            '../root/duo-device-context': { useDuoDevice: () => false },
            './constants': {
                DIRECTIONS_ROUTE_CAMERA_BOTTOM_GAP: 46,
                DIRECTIONS_ROUTE_CAMERA_HORIZONTAL_PADDING: 28,
                DIRECTIONS_ROUTE_CAMERA_TOP_GAP: 12,
                DIRECTIONS_ROUTE_SHEET_INITIAL_COVERAGE_RATIO: 0.47,
                MAP_CONTROL_BUTTON_SIZE: 48,
                MAP_SEARCH_BAR_HEIGHT: 52,
                MAP_SEARCH_TOP_OFFSET: 12,
                SEARCH_RESULTS_CAMERA_BOTTOM_GAP: 12,
                SEARCH_RESULTS_CAMERA_HORIZONTAL_PADDING: 36,
                SEARCH_RESULTS_CAMERA_TOP_GAP: 16,
                SEARCH_RESULTS_SHEET_EXPANDED_COVERAGE_RATIO: 0.5,
            },
        },
    );
    for (const width of [834, 1194, 1376]) {
        const padding = useMapCameraPadding({
            activeDirectionsRouteSheetCoverageRatio: 0.5,
            safeAreaInsets: insets,
            windowHeight: 834,
            windowWidth: width,
        });
        const paneWidth = Math.min(406, Math.floor(width / 2) - 24);
        assert.deepEqual(padding.cameraFocusPadding, [
            48,
            24,
            44,
            12 + paneWidth + 24,
        ]);
        assert.deepEqual(
            padding.directionsRouteCameraPadding,
            padding.cameraFocusPadding,
        );
        assert.deepEqual(
            padding.searchResultsCameraPadding,
            padding.cameraFocusPadding,
        );
    }
});
