import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createHookHarness,
    loadTourModule,
} from '../../map/__tests__/tour-test-helpers.mjs';
import { createE2EScorecardFixture } from '../scorecard-e2e-fixture.js';
import {
    getDuoMapSheetLayout,
    getDuoTrailCameraPadding,
} from '../../map/duo-map-sheet-layout.js';
import {
    getScorecardLevel,
    getScorecardPrivacyScore,
    getScorecardTripFuelEstimate,
    getScorecardWindowStats,
} from '../scorecard-engine.js';

function elements(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(elements);
    return [tree, ...elements(tree.props?.children)];
}
test('arrival recap keeps actions in a scrollable content-sized pane and clears the closed rail', () => {
    let width = 982;
    let isPad = false;
    let duoDevice = true;
    const fixture = createE2EScorecardFixture('arrival');
    const state = fixture.state;
    const actions = [];
    const { ScorecardArrivalRecap } = loadTourModule(
        new URL('../scorecard-arrival-recap.js', import.meta.url),
        {
            'react-native': {
                Platform: {
                    get isPad() {
                        return isPad;
                    },
                },
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                View: 'View',
                useWindowDimensions: () => ({ width, height: 678 }),
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({
                    top: 0,
                    bottom: 16,
                    left: 0,
                    right: 84,
                }),
            },
            '../root/duo-device-context': { useDuoDevice: () => duoDevice },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': { DafButton: 'Button' },
            '../design-system/tokens': { dafSemanticColors: {} },
            'expo-router': { router: { push: (route) => actions.push(route) } },
            './scorecard-context': {
                useScorecard: () => ({
                    pendingRecap: fixture.pendingRecap,
                    scorecardState: state,
                    level: getScorecardLevel(state.lifetime.xp),
                    windowStats: getScorecardWindowStats(state),
                    dismissRecap: () => actions.push('dismiss'),
                }),
            },
            './scorecard-engine': {
                getScorecardPrivacyScore,
                getScorecardTripFuelEstimate,
            },
        },
    );
    const open = ScorecardArrivalRecap();
    let panel = elements(open).find((e) =>
        e.props?.className?.includes('shadow-areaSheet'),
    );
    assert.equal(panel.props.style.left, 12);
    assert.equal(panel.props.style.right, 545);
    assert.equal(panel.props.style.top, 14);
    assert.equal(panel.props.style.bottom, undefined);
    assert.ok(panel.props.className.includes('rounded-dafXl'));
    assert.equal(panel.props.children.type, 'ScrollView');
    assert.equal(
        elements(open).some(
            (e) => e.props?.accessibilityLabel === 'Arrival recap backdrop',
        ),
        false,
    );
    width = 466;
    const closed = ScorecardArrivalRecap();
    panel = elements(closed).find((e) =>
        e.props?.className?.includes('shadow-areaSheet'),
    );
    assert.equal(panel.props.style.right, 84);
    assert.equal(panel.props.style.bottom, 0);
    elements(closed)
        .find((e) => e.props?.testID === 'scorecard-arrival-recap-timeline')
        .props.onPress();
    assert.deepEqual(actions, ['dismiss', '/scorecard/timeline']);
    isPad = true;
    duoDevice = false;
    width = 1194;
    const tablet = ScorecardArrivalRecap();
    panel = elements(tablet).find((e) =>
        e.props?.className?.includes('shadow-areaSheet'),
    );
    assert.equal(panel.props.style.left, 12);
    assert.equal(panel.props.style.right, 776);
    assert.equal(panel.props.style.top, 14);
    assert.equal(
        elements(tablet).some(
            (e) => e.props?.accessibilityLabel === 'Arrival recap backdrop',
        ),
        false,
    );
    width = 744;
    const narrowTablet = ScorecardArrivalRecap();
    panel = elements(narrowTablet).find((e) =>
        e.props?.className?.includes('shadow-areaSheet'),
    );
    assert.equal(panel.props.style, undefined);
    assert.match(panel.props.className, /rounded-t-dafSheet/);
});

for (const isPad of [true, false]) {
    test(`exposure details ${isPad ? 'float beside the tablet map' : 'retain the existing non-tablet page'}`, () => {
        const event = {
            id: 'read-1',
            label: 'International Boulevard and Thirty-Fifth Avenue, southbound side',
            certainty: 'confirmed',
            occurredAt: Date.now(),
        };
        const { default: Screen } = loadTourModule(
            new URL('../scorecard-event-detail-screen.js', import.meta.url),
            {
                'react-native': {
                    Platform: { isPad },
                    ScrollView: 'ScrollView',
                    View: 'View',
                    useWindowDimensions: () => ({ width: 1194, height: 834 }),
                },
                '../../lib/safe-area-insets': {
                    useSafeAreaInsets: () => ({
                        top: 42,
                        bottom: 20,
                        left: 0,
                        right: 0,
                    }),
                },
                '../root/native-navigation': {
                    HorizontalSafeAreaContent: 'SafeContent',
                },
                '../map/duo-map-sheet': { DuoMapSheet: 'MapSheet' },
                '../map/duo-map-sheet-layout': { getDuoMapSheetLayout },
                'expo-router': {
                    router: {},
                    useLocalSearchParams: () => ({ eventId: 'read-1' }),
                },
                '../design-system/icon': { Icon: 'Icon' },
                '../design-system/tokens': { dafSemanticColors: {} },
                './scorecard-context': {
                    useScorecard: () => ({
                        scorecardState: { exposures: [event] },
                    }),
                },
                './scorecard-engine': {
                    getExposureScoreImpact: () => -1,
                    getScorecardMonitoringCameraKey: () => 'camera-1',
                },
                './scorecard-map': { ScorecardExposureMap: 'Map' },
                './scorecard-screen-header': {
                    ScorecardPrivacyFooter: 'Privacy',
                    ScorecardScreenHeader: 'Header',
                },
            },
        );
        const tree = Screen();
        if (isPad) {
            assert.equal(tree.type, 'MapSheet');
            assert.equal(tree.props.tabletDevice, true);
            assert.deepEqual(
                tree.props.map.props.cameraPadding,
                [66, 24, 24, 442],
            );
            assert.deepEqual(tree.props.map.props.exposures, [event]);
            assert.equal(tree.props.map.props.fullViewport, true);
            const heading = elements(tree).find(
                (e) => e.props?.className === 'pr-12',
            );
            assert.ok(
                heading,
                'long camera titles reserve space for the tablet Close control',
            );
            assert.equal(heading.props.children[0].props.children, event.label);
            assert.equal(
                heading.props.children[0].props.numberOfLines,
                undefined,
                'long titles can wrap without truncation',
            );
        } else {
            assert.equal(tree.type, 'View');
            assert.ok(elements(tree).some((e) => e.type === 'Header'));
        }
    });
}
test('Scorecard map reapplies its camera when native layout changes during folding', () => {
    const hooks = createHookHarness();
    const stops = [];
    let width = 466;
    let fitting;
    const cameraSettings = { centerCoordinate: [-97.74, 30.27], zoomLevel: 14 };
    const { ScorecardExposureMap } = loadTourModule(
        new URL('../scorecard-map.js', import.meta.url),
        {
            react: hooks.react,
            'react-native': {
                View: 'View',
                useWindowDimensions: () => ({ width }),
                useColorScheme: () => 'light',
            },
            '@rnmapbox/maps': {
                __esModule: true,
                default: {
                    Camera: 'Camera',
                    StyleImport: 'StyleImport',
                    ShapeSource: 'Source',
                    LineLayer: 'Line',
                    CircleLayer: 'Circle',
                    SymbolLayer: 'Symbol',
                    MarkerView: 'Marker',
                },
            },
            '../root/duo-device-context': { useDuoDevice: () => true },
            '../map/camera-state': {
                getBoundsFitCameraStop: (input) => {
                    fitting = input;
                    return cameraSettings;
                },
            },
            '../map/native-components': { NativeWindMapView: 'Map' },
            '../map/config': {
                MAPBOX_ACCESS_TOKEN: 'test',
                MAPBOX_STANDARD_LIGHT_PRESET_DAY: 'day',
                MAPBOX_STANDARD_LIGHT_PRESET_NIGHT: 'night',
                MAPBOX_STANDARD_STYLE_IMPORT_ID: 'basemap',
                MAPBOX_STANDARD_STYLE_URL: 'test',
            },
            './scorecard-map-data': {
                getScorecardExposureMapData: () => ({
                    bounds: { sw: [0, 0], ne: [1, 1] },
                    mappedExposures: [],
                    pointCollection: { features: [] },
                    coneCollection: { features: [] },
                    lineCollection: { features: [] },
                }),
            },
        },
    );
    const tree = hooks.render(() =>
        ScorecardExposureMap({ exposures: [], height: 678, testID: 'map' }),
    );
    const camera = elements(tree).find((e) => e.type === 'Camera');
    camera.props.ref.current = { setCamera: (stop) => stops.push(stop) };
    tree.props.onLayout();
    assert.deepEqual(stops, [cameraSettings]);
    width = 1194;
    const tablet = hooks.render(() =>
        ScorecardExposureMap({
            exposures: [],
            height: 834,
            cameraPadding: [66, 24, 24, 442],
            fullViewport: true,
        }),
    );
    assert.equal(
        fitting.viewportWidth,
        1194,
        'tablet map uses the full screen, without the phone card gutter',
    );
    assert.deepEqual(
        fitting.padding,
        [66, 24, 24, 442],
        'camera fitting keeps exposures to the right of the left pane',
    );
    assert.equal(tablet.props.style.height, 834);
});

test('tablet reconstructed-trail heading reserves room for Close and keeps the map beside it', () => {
    const { default: Screen } = loadTourModule(
        new URL('../scorecard-trail-screen.js', import.meta.url),
        {
            react: {
                useEffect() {},
                useMemo: (fn) => fn(),
                useState: (value) => [value, () => {}],
            },
            'react-native': {
                Platform: { isPad: true },
                View: 'View',
                ScrollView: 'ScrollView',
                useWindowDimensions: () => ({ width: 1194, height: 834 }),
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({
                    top: 42,
                    bottom: 20,
                    left: 0,
                    right: 0,
                }),
            },
            '../root/native-navigation': {
                HorizontalSafeAreaContent: 'SafeContent',
            },
            '../map/duo-map-sheet': { DuoMapSheet: 'MapSheet' },
            '../map/duo-map-sheet-layout': {
                getDuoMapSheetLayout,
                getDuoTrailCameraPadding,
            },
            'expo-router': {
                router: {},
                useLocalSearchParams: () => ({ driveId: 'drive-1' }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/tokens': { dafSemanticColors: {} },
            '../map/api': { getDirections() {} },
            './scorecard-context': {
                useScorecard: () => ({ scorecardState: {} }),
            },
            './scorecard-drive-exposures': {
                getScorecardExposureDriveGroup: () => ({
                    driveId: 'drive-1',
                    startedAt: Date.now(),
                    exposures: [
                        {
                            id: 'read-1',
                            certainty: 'confirmed',
                            occurredAt: Date.now(),
                        },
                    ],
                }),
            },
            './scorecard-fastest-trail': {
                getScorecardFastestTrailLineCollection() {},
            },
            './scorecard-map': { ScorecardExposureMap: 'Map' },
            './scorecard-screen-header': {
                ScorecardPrivacyFooter: 'Privacy',
                ScorecardScreenHeader: 'Header',
            },
        },
    );
    const tree = Screen();
    assert.equal(tree.type, 'MapSheet');
    assert.match(tree.props.header.props.className, /pr-16/);
    assert.equal(tree.props.map.props.fullViewport, true);
    assert.deepEqual(tree.props.map.props.cameraPadding, [66, 64, 44, 482]);
});
