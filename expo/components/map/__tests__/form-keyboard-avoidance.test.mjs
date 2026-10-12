import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const match = find(child, predicate);
        if (match) return match;
    }
    return null;
}

function loadForm(file, platform, extraMocks = {}) {
    const hooks = createHookHarness();
    const components = Object.fromEntries(
        [
            'KeyboardAvoidingView',
            'Modal',
            'Pressable',
            'ScrollView',
            'Switch',
            'Text',
            'TextInput',
            'View',
        ].map((name) => [name, name]),
    );
    const exports = loadTourModule(new URL(`../../${file}`, import.meta.url), {
        react: hooks.react,
        'react-native': {
            ...components,
            Platform: { OS: platform },
            useColorScheme: () => 'light',
        },
        'expo-router': {
            router: {},
            useIsFocused: () => true,
            useLocalSearchParams: () => ({ areaId: '1' }),
        },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ top: 24, bottom: 20 }),
        },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': {
            DafButton: 'Button',
            DafChip: 'Chip',
            DafSectionLabel: 'Label',
            DafTextInput: 'TextInput',
        },
        '../design-system/tokens': {
            dafSemanticColors: { brand: '#0F7D45' },
            getDafTheme: () => ({ text: { brand: '#0F7D45' } }),
        },
        ...extraMocks,
    });
    return { exports, render: (callback) => hooks.render(callback) };
}

function assertAvoidance(tree, platform) {
    const guard = find(tree, (node) => node.type === 'KeyboardAvoidingView');
    assert.ok(guard, 'the form must adjust when the keyboard opens');
    assert.equal(guard.props.behavior, 'padding');
    const scroll = find(guard, (node) => node.type === 'ScrollView');
    assert.ok(
        scroll,
        'content must remain reachable when the available height shrinks',
    );
    assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
    return { guard, scroll };
}

for (const platform of ['ios', 'android']) {
    test(`full-screen location search guards its result list on ${platform}`, () => {
        const { exports, render } = loadForm(
            'map/map-full-screen-search.js',
            platform,
            {
                './use-responsive-map-layout': {
                    useResponsiveMapLayout: () => ({ isWide: false }),
                },
                './directions': { DIRECTIONS_MODE_DIRECTIONS: 'directions' },
                './directions-current-location-option': {},
                './google-results-footer': {},
                './place-search-result-row': {},
                './primary-location-cards': {},
                './primary-locations': {},
                './saved-location-section': {},
                './submitted-search-result-row': {},
                './map-screen-context': {
                    useMapSearchContext: () => ({
                        mapPreferencesAreLoaded: true,
                        searchPageIsVisible: true,
                        searchSource: 'phone',
                        searchValue: '',
                        trimmedSearchValue: '',
                        searchFavoriteLocations: [],
                        searchRecentLocations: [],
                        submittedSearchResults: [],
                    }),
                },
            },
        );
        assertAvoidance(
            render(() => exports.MapFullScreenSearch()),
            platform,
        );
    });

    test(`area creation guards its search sheet on ${platform}`, () => {
        const { exports, render } = loadForm(
            'areas/add-area-screen.js',
            platform,
            {
                'expo-location': {},
                './area-geometry': {
                    AREA_KINDS: {},
                    geometrySquareMiles: () => 0,
                },
                './area-map': { AreaMap: 'Map' },
                './area-radius-control': { AreaRadiusControl: 'Radius' },
                './areas-api': {},
                './areas-context': { useAreas: () => ({}) },
                './area-ui': {
                    AreaButton: 'Button',
                    AreaSheet: 'Sheet',
                    AreaText: 'Text',
                    AreaSegmentedControl: 'Segments',
                },
            },
        );
        const tree = render(() => exports.default());
        assert.equal(tree.type, 'KeyboardAvoidingView');
        assert.equal(tree.props.behavior, 'padding');
        const sheet = find(tree, (node) => node.type === 'Sheet');
        assert.ok(find(sheet, (node) => node.type === 'TextInput'));
    });

    test(`help search keeps its result list usable while typing on ${platform}`, () => {
        const { exports, render } = loadForm(
            'information/faq-screen.js',
            platform,
            {
                './community-content': {
                    faqItems: [{ question: 'Test?', answer: 'Yes' }],
                },
                './information-page-state': {
                    FAQ_FILTERS: [],
                    getVisibleFaqItems: () => [],
                },
                './information-screen': { InformationHeader: 'Header' },
            },
        );
        const tree = render(() => exports.FaqScreen());
        const { guard } = assertAvoidance(tree, platform);
        assert.ok(
            find(guard, (node) => node.props?.testID === 'faq-search-input'),
        );
    });

    test(`changeset fields and next action share keyboard avoidance on ${platform}`, () => {
        const { exports, render } = loadForm(
            'contribute/changeset-details-screen.js',
            platform,
            {
                './contribute-state': {
                    useContribute: () => ({
                        changeset: { comment: '', hashtags: '' },
                        pins: [],
                        removals: [],
                        tour: {},
                        updateChangeset() {},
                    }),
                },
                './changeset-summary': {
                    getChangesetSummary: () => ({
                        total: 1,
                        label: 'one addition',
                    }),
                },
                './contribute-tour-overlay': {
                    ContributeTourOverlay: 'Overlay',
                },
                './contribute-tour-target': { ContributeTourTarget: 'Target' },
                './step-header': { ContributePageHeader: 'Header' },
            },
        );
        const tree = render(() => exports.default());
        const { guard, scroll } = assertAvoidance(tree, platform);
        assert.ok(
            find(
                scroll,
                (node) => node.props?.testID === 'contribute-hashtags-input',
            ),
        );
        assert.ok(
            find(
                guard,
                (node) =>
                    node.props?.testID === 'contribute-next-review-button',
            ),
        );
    });

    test(`fuel settings can scroll both inputs and save while typing on ${platform}`, () => {
        const { exports, render } = loadForm(
            'scorecard/scorecard-fuel-settings-modal.js',
            platform,
        );
        let saved;
        let dismissed = false;
        const tree = render(() =>
            exports.ScorecardFuelSettingsModal({
                visible: true,
                fuelEconomyMpg: 25,
                gasPricePerGallon: 3,
                onSave: (value) => {
                    saved = value;
                },
                onDismiss: () => {
                    dismissed = true;
                },
            }),
        );
        const { scroll } = assertAvoidance(tree, platform);
        assert.ok(
            find(
                scroll,
                (node) => node.props?.testID === 'scorecard-fuel-mpg-input',
            ),
        );
        assert.ok(
            find(
                scroll,
                (node) => node.props?.testID === 'scorecard-fuel-price-input',
            ),
        );
        find(
            scroll,
            (node) => node.props?.testID === 'scorecard-fuel-settings-save',
        ).props.onPress();
        assert.deepEqual(saved, { fuelEconomyMpg: 25, gasPricePerGallon: 3 });
        assert.equal(dismissed, true);
    });

    test(`area alert time can be edited and saved within keyboard avoidance on ${platform}`, () => {
        const area = {
            id: 1,
            name: 'Home',
            kind: 'circle',
            digest_time: '08:00',
            alert_mode: 'daily',
        };
        const calls = [];
        const { exports, render } = loadForm(
            'areas/area-alerts-screen.js',
            platform,
            {
                './areas-context': {
                    useAreas: () => ({
                        areas: [area],
                        refresh() {},
                        updateArea: async (...args) => calls.push(args),
                    }),
                },
                './area-geometry': {
                    ALERT_MODES: [{ value: 'daily', label: 'Daily' }],
                    AREA_KINDS: {},
                },
                './area-notifications': { registerAreaNotifications() {} },
                './area-ui': {
                    AreaButton: 'Button',
                    AreaHeader: 'Header',
                    AreaText: 'Text',
                    AreaError: 'Error',
                    AreaPrivacy: 'Privacy',
                },
            },
        );
        let tree = render(() => exports.default());
        assertAvoidance(tree, platform);
        const edit = find(
            tree,
            (node) => node.props?.accessibilityLabel === 'Change digest time',
        );
        assert.ok(edit);
        edit.props.onPress();
        tree = render(() => exports.default());
        const { scroll } = assertAvoidance(tree, platform);
        const input = find(scroll, (node) => node.type === 'TextInput');
        assert.ok(input);
        input.props.onChangeText('09:30');
        tree = render(() => exports.default());
        const save = find(
            tree,
            (node) =>
                node.type === 'Button' && node.props.children === 'Save time',
        );
        assert.equal(save.props.disabled, false);
        save.props.onPress();
        assert.deepEqual(calls, [['1', { digest_time: '09:30' }]]);
    });
}

test('permission search uses the sheet keyboard input and allows scrolling to the search action', () => {
    const { exports } = loadForm('map/location-permission-sheet.js', 'ios', {
        './location-acquisition-view': {
            LocationAcquisitionView: 'Acquisition',
        },
        './map-screen-context': {
            usePermissionSheetContext: () => ({
                mapPreferencesAreLoaded: true,
                locationAccessSearchValue: '',
                insets: { top: 24, bottom: 20 },
                bottomSheetRef: { current: {} },
                permissionSheetTrackingHandlers: {},
            }),
        },
        './native-components': {
            NativeWindBottomSheetModal: 'Sheet',
            NativeWindBottomSheetScrollView: 'ScrollView',
            NativeWindBottomSheetTextInput: 'SheetInput',
        },
    });
    const tree = exports.LocationPermissionSheet();
    assert.equal(tree.props.keyboardBlurBehavior, 'restore');
    const scroll = find(tree, (node) => node.type === 'ScrollView');
    assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
    assert.ok(find(scroll, (node) => node.type === 'SheetInput'));
    assert.ok(
        find(
            scroll,
            (node) =>
                node.props?.accessibilityLabel === 'Search a place or ZIP' &&
                node.type === 'Button',
        ),
    );
});
