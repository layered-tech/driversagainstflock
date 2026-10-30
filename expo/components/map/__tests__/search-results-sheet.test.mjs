import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

const mapSearchSource = readFileSync(
    new URL('../use-map-search.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);

test('renders the submitted search results sheet with the map', () => {
    assert.match(mapScreenSource, /<SearchResultsSheet \/>/);
});

test('submitted searches leave full-screen search and present the results sheet', () => {
    assert.match(
        mapSearchSource,
        /submitSubmittedSearchQuery\(query\);\s+setSearchIsFocused\(false\);\s+setSearchPageIsVisible\(false\);/,
    );
});

test('back from place details restores the submitted results sheet', () => {
    assert.match(
        mapSearchSource,
        /const handleSelectedPlaceBackToSearchResults = useCallback\(\(\) => \{[\s\S]*?dismissPlaceSheet\(\);[\s\S]*?setSearchIsFocused\(false\);\s+setSearchPageIsVisible\(false\);/,
    );
});

test('dismissed search results remount their modal before returning from a place', () => {
    const harness = createHookHarness();
    const dismissals = [];
    const sheetRef = { current: null };
    const { SearchResultsSheet } = loadTourModule(
        new URL('../search-results-sheet.js', import.meta.url),
        {
            react: harness.react,
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeNavigationAction',
                NativeModalContent: 'NativeModalContent',
            },
            'react-native': {},
            '../design-system/icon': {},
            './map-screen-context': {
                useSearchResultsContext: () => ({
                    insets: { bottom: 0 },
                    mapPreferencesAreLoaded: true,
                    submittedSearchResults: [],
                    submittedSearchResultsSheetRef: sheetRef,
                    submittedSearchResultsSheetTrackingHandlers: {
                        onDismiss: (...args) => dismissals.push(args),
                    },
                }),
            },
            './native-components': { NativeWindBottomSheetModal: 'Modal' },
            './submitted-search-result-row': {},
            './use-bottom-sheet-presented-state': {
                useBottomSheetPresentedState: ({ onDismiss }) => ({
                    handleBottomSheetDismiss: onDismiss,
                }),
            },
        },
    );
    const render = () => harness.render(SearchResultsSheet);
    const first = render();
    assert.equal(first.props.ref, sheetRef);
    assert.equal(render().key, first.key);
    first.props.onDismiss({ programmatic: true });
    const second = render();
    assert.notEqual(second.key, first.key);
    assert.equal(second.props.ref, sheetRef);
    assert.deepEqual(dismissals, [[{ programmatic: true }]]);
    second.props.onDismiss({ programmatic: true });
    assert.notEqual(render().key, second.key);
});

test('dismissed place details remount before returning from directions to the same place', () => {
    const harness = createHookHarness();
    const dismissals = [];
    const sheetRef = { current: null };
    const selectedResult = { id: 'same-place' };
    const { SelectedPlaceSheet } = loadTourModule(
        new URL('../selected-place-sheet.js', import.meta.url),
        {
            react: harness.react,
            '@gorhom/bottom-sheet': {},
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeNavigationAction',
                NativeModalContent: 'NativeModalContent',
            },
            'react-native': { useWindowDimensions: () => ({ height: 800 }) },
            '../design-system/icon': {},
            '../design-system/primitives': {},
            '../design-system/tokens': { dafSemanticColors: {} },
            './map-screen-context': {
                usePlaceSheetContext: () => ({
                    insets: { bottom: 0 },
                    mapPreferencesAreLoaded: true,
                    placeSheetRef: sheetRef,
                    selectedSearchResult: selectedResult,
                    placeSheetTrackingHandlers: {
                        onDismiss: (...args) => dismissals.push(args),
                    },
                }),
            },
            './native-components': { NativeWindBottomSheetModal: 'Modal' },
            './primary-locations': { getPrimaryLocationLabel: () => '' },
            './use-bottom-sheet-presented-state': {
                useBottomSheetPresentedState: ({ onDismiss }) => ({
                    handleBottomSheetDismiss: onDismiss,
                }),
            },
        },
    );
    const render = () => harness.render(SelectedPlaceSheet);
    const first = render();
    assert.equal(render().key, first.key);
    first.props.onDismiss({ programmatic: true });
    const second = render();
    assert.notEqual(second.key, first.key);
    assert.equal(second.props.ref, sheetRef);
    assert.deepEqual(dismissals, [[{ programmatic: true }]]);
});

test('tablet submitted search results offer a working close without changing phone controls', () => {
    for (const tablet of [false, true]) {
        const harness = createHookHarness();
        let dismissals = 0;
        const sheetRef = {
            current: {
                dismiss: () => {
                    dismissals += 1;
                },
            },
        };
        const { SearchResultsSheet } = loadTourModule(
            new URL('../search-results-sheet.js', import.meta.url),
            {
                react: harness.react,
                'react-native': { Platform: { isPad: tablet } },
                '../design-system/icon': {},
                './map-screen-context': {
                    useSearchResultsContext: () => ({
                        insets: { bottom: 0 },
                        mapPreferencesAreLoaded: true,
                        submittedSearchResults: [],
                        submittedSearchResultsSheetRef: sheetRef,
                        submittedSearchResultsSheetTrackingHandlers: {},
                    }),
                },
                './native-components': { NativeWindBottomSheetModal: 'Modal' },
                './submitted-search-result-row': {},
                './use-bottom-sheet-presented-state': {
                    useBottomSheetPresentedState: () => ({}),
                },
            },
        );
        const tree = harness.render(SearchResultsSheet);
        const header = tree.props.children.props.ListHeaderComponent;
        const findClose = (node) => {
            if (!node || typeof node !== 'object') return null;
            if (node.props?.testID === 'submitted-search-results-close')
                return node;
            return [node.props?.children]
                .flat(Infinity)
                .map(findClose)
                .find(Boolean);
        };
        const close = findClose(header);
        assert.equal(Boolean(close), tablet);
        if (close) close.props.onPress();
        assert.equal(dismissals, tablet ? 1 : 0);
        harness.cleanup();
    }
});

test('unfolded Android place details provide an in-pane Close action', () => {
    const hooks = createHookHarness();
    let closes = 0;
    const { SelectedPlaceSheet } = loadTourModule(
        new URL('../selected-place-sheet.js', import.meta.url),
        {
            react: hooks.react,
            'react-native': {
                Platform: { OS: 'android' },
                View: 'View',
                Pressable: 'Pressable',
                useWindowDimensions: () => ({ width: 852, height: 883 }),
            },
            '../root/duo-device-context': { useDuoDevice: () => true },
            '../root/native-navigation': {},
            '../design-system/icon': {},
            '../design-system/primitives': {},
            '../design-system/tokens': { dafSemanticColors: {} },
            './map-screen-context': {
                usePlaceSheetContext: () => ({
                    insets: { bottom: 24 },
                    mapPreferencesAreLoaded: true,
                    selectedSearchResult: { id: 'test-place' },
                    selectedPlaceName: 'A place with a long title',
                    placeSheetTrackingHandlers: {},
                    handleClearSelectedSearchResult: () => closes++,
                }),
            },
            './native-components': { NativeWindBottomSheetModal: 'Modal' },
            './primary-locations': { getPrimaryLocationLabel: () => '' },
            './use-bottom-sheet-presented-state': {
                useBottomSheetPresentedState: () => ({
                    bottomSheetIsPresented: true,
                }),
            },
        },
    );
    const nodes = (node) =>
        !node || typeof node !== 'object'
            ? []
            : Array.isArray(node)
              ? node.flatMap(nodes)
              : [node, ...nodes(node.props?.children)];
    const close = nodes(hooks.render(SelectedPlaceSheet)).find(
        (node) => node.props.testID === 'place-details-close-button',
    );
    assert.equal(close.props.accessibilityLabel, 'Close place details');
    close.props.onPress();
    assert.equal(closes, 1);
});
