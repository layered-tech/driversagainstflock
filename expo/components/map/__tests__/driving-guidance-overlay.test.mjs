import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { getNavigationPuckAnchorY } from '../navigation-puck-layout.js';

const drivingGuidanceOverlaySource = readFileSync(
    new URL('../driving-guidance-overlay.js', import.meta.url),
    'utf8',
);
const drivingLocationRoadStackSource = readFileSync(
    new URL('../driving-location-road-stack.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);
const stepsSheetSource = readFileSync(
    new URL('../driving-steps-sheet.js', import.meta.url),
    'utf8',
);

describe('DrivingGuidanceOverlay', () => {
    test('keeps the route-switched destination surface free of NativeWind shadows', () => {
        assert.doesNotMatch(
            drivingGuidanceOverlaySource,
            /overflow-hidden shadow-/,
        );
        assert.match(
            stepsSheetSource,
            /backgroundClassName="rounded-t-\[22px\] border-t border-daf-border-glass/,
        );
    });

    test('hides speed status and the current road pill in route mode', () => {
        assert.match(
            mapScreenSource,
            /drivingStatusIsVisible=\{shouldShowDrivingMapStatus\(\s*drivingMapViewMode,?\s*\)\}/,
        );
        assert.match(
            drivingGuidanceOverlaySource,
            /statusChromeIsVisible[\s\S]*?<SpeedLimitSign/,
        );
        assert.match(
            drivingGuidanceOverlaySource,
            /<DrivingLocationRoadStack\s+isHidden=\{!statusChromeIsVisible\}/,
        );
        assert.match(
            drivingLocationRoadStackSource,
            /currentRoadPillIsVisible &&[\s\S]*?shouldShowCurrentRoadPill/,
        );
    });
});

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const element = (type, props) => ({ type, props });

function loadComponent(source, dependencies) {
    const module = { exports: {} };
    const code = transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            require('@babel/plugin-transform-modules-commonjs'),
        ],
    }).code;
    const mocks = {
        react: {
            useCallback: (fn) => fn,
            useMemo: (fn) => fn(),
            useState: (initial) => [
                typeof initial === 'function' ? initial() : initial,
                () => {},
            ],
            useRef: (initial) => ({ current: initial }),
            useEffect() {},
        },
        'react/jsx-runtime': { jsx: element, jsxs: element },
        'react-native': {
            ActivityIndicator: 'ActivityIndicator',
            Pressable: 'Pressable',
            Text: 'Text',
            View: 'View',
            useColorScheme: () => 'light',
            useWindowDimensions: () => ({ height: 900, width: 400 }),
        },
        ...dependencies,
    };
    new Function('require', 'module', 'exports', code)(
        (name) => mocks[name],
        module,
        module.exports,
    );
    return module.exports;
}

function nodes(element) {
    return element && typeof element === 'object'
        ? [element, ...[element.props?.children].flat().flatMap(nodes)]
        : [];
}

function loadOverlay(overrides = {}) {
    return loadComponent(drivingGuidanceOverlaySource, {
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({
                top: 46,
                bottom: 34,
                left: 0,
                right: 0,
            }),
        },
        './analytics': {},
        './directions': {
            createDirectionsRouteProgressTracker: () => ({
                update: () => null,
            }),
            getSelectedDirectionsRouteOption: () => null,
            getActiveDirectionsManeuver: () => null,
            getNextDirectionsManeuver: () => null,
            getDirectionsSteps: () => [],
        },
        './shared-navigation-controller': {
            useSharedNavigationRerouting: () => false,
        },
        './driving-alerts-overlay': { DrivingAlertsOverlay: 'Alerts' },
        './driving-guidance-cards': {},
        './driving-steps-sheet': {},
        './driving-location-road-stack': {
            DrivingLocationRoadStack: 'RoadStack',
        },
        './e2e-driving-alert-fixture': {
            useE2EDrivingAlertsFixture: () => null,
        },
        './native-components': { NativeWindSafeAreaView: 'SafeArea' },
        './shared-map-state': {
            useSharedMapState: () => ({}),
            useSharedMapLocationState: () => ({}),
        },
        './speed-limit': {
            getRouteCurrentSpeedMps: () => 10,
            useRouteSpeedLimit: () => 35,
            SpeedLimitSign: 'SpeedLimitSign',
        },
        './speed-limit-layout': { MOBILE_SPEED_LIMIT_BADGE_SIZE: 80 },
        ...overrides,
    });
}

function loadButton() {
    return loadComponent(
        readFileSync(
            new URL('../../design-system/primitives.js', import.meta.url),
            'utf8',
        ),
        {
            './icon': {},
            './tokens': { dafSemanticColors: {} },
        },
    ).DafButton;
}

test('sheet-compatible buttons retain default controls, disabled states, and styling', () => {
    const DafButton = loadButton();
    const onPress = () => {};
    const props = { onPress, variant: 'danger', children: 'Exit' };
    const regularButton = DafButton(props);
    assert.equal(regularButton.type, 'Pressable');
    for (const [disabled, loading] of [
        [false, false],
        [true, false],
        [false, true],
    ]) {
        const button = DafButton({
            ...props,
            disabled,
            loading,
            pressableComponent: 'SheetTouchable',
        });
        assert.equal(button.type, 'SheetTouchable');
        assert.equal(button.props.onPress, onPress);
        assert.equal(button.props.className, regularButton.props.className);
        assert.equal(button.props.disabled, disabled || loading);
        assert.deepEqual(button.props.accessibilityState, {
            busy: loading,
            disabled: disabled || loading,
        });
    }
});

for (const expanded of [false, true]) {
    for (const rerouting of [false, true]) {
        test(`Exit ends navigation with the drawer ${expanded ? 'expanded' : 'collapsed'} and rerouting ${rerouting ? 'active' : 'idle'}`, () => {
            const destination = {
                label: 'Austin Central Library',
                placeId: 'library',
                location: { longitude: -97.7518, latitude: 30.2654 },
            };
            const route = { destination };
            const events = [];
            const state = {
                directionsRoute: route,
                drivingModeIsActive: true,
                pendingDirectionsRequest: { id: 'pending-route' },
                pendingSearchResultRestore: null,
            };
            const set = (key) => (value) => {
                state[key] = value;
            };
            const { DrivingGuidanceOverlay } = loadOverlay({
                './analytics': {
                    logMapDrivingStopped: ({ route }) =>
                        events.push(['stopped', route]),
                },
                './directions': {
                    createDirectionsRouteProgressTracker: () => ({
                        update: () => null,
                    }),
                    getSelectedDirectionsRouteOption: (route) => route,
                    getActiveDirectionsManeuver: () => null,
                    getNextDirectionsManeuver: () => null,
                    getDirectionsSteps: () => [],
                    getRemainingDirectionsRouteValues: () => null,
                    getDirectionsWaypointCoordinate: (waypoint) => [
                        waypoint.location.longitude,
                        waypoint.location.latitude,
                    ],
                },
                './shared-navigation-controller': {
                    useSharedNavigationRerouting: () => rerouting,
                    cancelSharedNavigationRerouting: () =>
                        events.push(['cancel-rerouting']),
                },
                './shared-map-state': {
                    useSharedMapState: () => ({
                        ...state,
                        setDirectionsRoute: set('directionsRoute'),
                        setDrivingModeIsActive: set('drivingModeIsActive'),
                        setPendingDirectionsRequest: set(
                            'pendingDirectionsRequest',
                        ),
                        setPendingSearchResultRestore: set(
                            'pendingSearchResultRestore',
                        ),
                    }),
                    useSharedMapLocationState: () => ({}),
                },
                './driving-steps-sheet': { DrivingStepsSheet: 'StepsSheet' },
            });
            const DafButton = loadButton();
            const directions = {
                getDirectionsSteps: () => [],
                formatDirectionsArrivalTime: () => '',
                formatDirectionsDistance: () => '',
                formatDirectionsDuration: () => '',
            };
            const { DestinationCard } = loadComponent(
                readFileSync(
                    new URL('../driving-guidance-cards.js', import.meta.url),
                    'utf8',
                ),
                {
                    '../design-system/primitives': { DafButton },
                    '../design-system/tokens': {},
                    './directions': directions,
                    './constants': { DRIVING_DESTINATION_BOTTOM_PADDING: 16 },
                    './native-components': {
                        NativeWindBottomSheetTouchableOpacity: 'SheetTouchable',
                    },
                },
            );
            let stateIndex = 0;
            const { DrivingStepsSheet } = loadComponent(
                readFileSync(
                    new URL('../driving-steps-sheet.js', import.meta.url),
                    'utf8',
                ),
                {
                    react: {
                        useCallback: (fn) => fn,
                        useEffect() {},
                        useMemo: (fn) => fn(),
                        useRef: (initial) => ({ current: initial }),
                        useState: () => [
                            [expanded, true][stateIndex++],
                            () => {},
                        ],
                    },
                    './directions': directions,
                    './driving-guidance-cards': { DestinationCard },
                    './native-components': {
                        NativeWindBottomSheet: 'BottomSheet',
                        NativeWindBottomSheetFlatList: 'FlatList',
                    },
                },
            );
            const sheetNode = nodes(
                DrivingGuidanceOverlay({
                    routeExportIsAvailable: true,
                    onRouteExport: () => events.push(['export']),
                }),
            ).find((node) => node.type === 'StepsSheet');
            const sheet = DrivingStepsSheet(sheetNode.props);
            const summary = sheet.props.handleComponent().props.children[1];
            assert.equal(sheet.props.index, 0);
            assert.equal(
                sheet.props.handleComponent().props.children[0].props
                    .accessibilityState.expanded,
                expanded,
            );
            const summaryNodes = nodes(DestinationCard(summary.props));
            const exportButton = DafButton(
                summaryNodes.find(
                    (node) =>
                        node.props.testID === 'driving-route-export-button',
                ).props,
            );
            assert.equal(exportButton.type, 'SheetTouchable');
            exportButton.props.onPress();
            assert.deepEqual(events, [['export']]);
            events.length = 0;
            const button = summaryNodes.find(
                (node) => node.props.testID === 'driving-cancel-route-button',
            );
            const control = DafButton(button.props);
            assert.equal(
                control.type,
                'SheetTouchable',
                'The Exit button must use a touchable compatible with the drawer pan gesture',
            );
            assert.equal(control.props.accessibilityRole, 'button');
            assert.equal(control.props.disabled, false);
            control.props.onPress();
            assert.equal(state.directionsRoute, null);
            assert.equal(state.drivingModeIsActive, false);
            assert.equal(state.pendingDirectionsRequest, null);
            assert.deepEqual(events, [
                ['cancel-rerouting'],
                ['stopped', route],
            ]);
            assert.equal(
                state.pendingSearchResultRestore.result.placeId,
                'library',
            );
            assert.equal(
                state.pendingSearchResultRestore.result.label,
                destination.label,
            );
            assert.deepEqual(state.pendingSearchResultRestore.place.location, {
                latitude: 30.2654,
                longitude: -97.7518,
            });
            assert.equal(
                nodes(DrivingGuidanceOverlay({})).some(
                    (node) => node.type === 'StepsSheet',
                ),
                false,
            );
        });
    }
}

test('paused and resumed follow toggle visibility while keeping the speed and road components mounted', () => {
    const { DrivingGuidanceOverlay } = loadOverlay();
    for (const cameraIsFollowingUser of [true, false, false, true]) {
        const rendered = nodes(
            DrivingGuidanceOverlay({ cameraIsFollowingUser }),
        );
        const speedWrapper = rendered.find(
            (node) => node.props.testID === 'driving-speed-status',
        );
        assert.equal(
            speedWrapper.props.className,
            cameraIsFollowingUser ? 'opacity-100' : 'opacity-0',
        );
        assert.equal(
            speedWrapper.props.accessibilityElementsHidden,
            !cameraIsFollowingUser,
        );
        assert.equal(speedWrapper.props.children.type, 'SpeedLimitSign');
        const roadStack = rendered.find((node) => node.type === 'RoadStack');
        assert.equal(roadStack.props.isHidden, !cameraIsFollowingUser);
        assert.equal(roadStack.props.currentRoadPillIsVisible, undefined);
    }
    const overview = nodes(
        DrivingGuidanceOverlay({
            cameraIsFollowingUser: true,
            drivingStatusIsVisible: false,
        }),
    );
    assert.equal(
        overview.find((node) => node.props.testID === 'driving-speed-status')
            .props.className,
        'opacity-0',
    );
    assert.equal(
        overview.find((node) => node.type === 'RoadStack').props.isHidden,
        true,
    );
    assert.match(
        mapScreenSource,
        /cameraIsFollowingUser=\{\s*locationController\.nativeCameraFollowProps\s*\.enabled\s*\}/,
    );
});

test('hiding the road pill preserves its contents and location anchor layout', () => {
    const { DrivingLocationRoadStack } = loadComponent(
        drivingLocationRoadStackSource,
        {
            './current-road-context': {
                CurrentRoadPill: 'RoadPill',
                useStableCurrentRoadText: () => 'Main Street',
            },
            './current-road-pill-layout': {
                shouldShowCurrentRoadPill: () => true,
            },
            './navigation-puck-layout': {
                getNavigationPuckAnchorY,
                NAVIGATION_PUCK_SIZE: 75,
            },
        },
    );
    const anchors = [];
    const props = { onLocationAnchorLayout: (anchor) => anchors.push(anchor) };
    const shown = DrivingLocationRoadStack(props);
    const hidden = DrivingLocationRoadStack({ ...props, isHidden: true });
    assert.deepEqual(shown.props.children, hidden.props.children);
    assert.match(hidden.props.className, /opacity-0/);
    assert.equal(hidden.props.importantForAccessibility, 'no-hide-descendants');
    shown.props.onLayout({ nativeEvent: { layout: { y: 500 } } });
    hidden.props.onLayout({ nativeEvent: { layout: { y: 500 } } });
    assert.equal(anchors.length, 2);
    assert.equal(anchors[0], anchors[1]);
});

test('step focus survives progress and paging until recenter or a replacement route', () => {
    const state = [];
    const effects = [];
    let index = 0;
    let dirty = false;
    const hooks = {
        useState(initial) {
            const slot = index++;
            if (!(slot in state))
                state[slot] =
                    typeof initial === 'function' ? initial() : initial;
            return [
                state[slot],
                (value) => {
                    const next =
                        typeof value === 'function'
                            ? value(state[slot])
                            : value;
                    dirty ||= next !== state[slot];
                    state[slot] = next;
                },
            ];
        },
        useRef: (value) => ({ current: value }),
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
        useEffect(fn, deps) {
            const slot = index++;
            if (
                !state[slot] ||
                deps.some((value, i) => value !== state[slot][i])
            ) {
                effects.push(fn);
                state[slot] = deps;
            }
        },
    };
    const steps = [0, 1, 2].map((stepIndex) => ({
        stepIndex,
        instruction: `Step ${stepIndex}`,
        coordinate: [-87, 41 + stepIndex],
        displayDistance: 100,
    }));
    let route = { steps };
    let activeIndex = 1;
    let following = true;
    let focusSucceeds = true;
    const focusedCoordinates = [];
    const { DrivingGuidanceOverlay } = loadOverlay({
        react: hooks,
        './directions': {
            createDirectionsRouteProgressTracker: () => ({
                update: () => null,
            }),
            getSelectedDirectionsRouteOption: () => route,
            getActiveDirectionsManeuver: () => steps[activeIndex],
            getNextDirectionsManeuver: () => steps[activeIndex + 1],
            getDirectionsSteps: () => steps,
            getRemainingDirectionsRouteValues: () => ({}),
        },
        './shared-map-state': {
            useSharedMapState: () => ({ directionsRoute: route }),
            useSharedMapLocationState: () => ({}),
        },
        './driving-guidance-cards': { ManeuverCard: 'ManeuverCard' },
        './driving-steps-sheet': { DrivingStepsSheet: 'StepsSheet' },
    });
    function render() {
        let tree;
        do {
            dirty = false;
            index = 0;
            tree = nodes(
                DrivingGuidanceOverlay({
                    cameraIsFollowingUser: following,
                    onStepFocus(coordinate) {
                        if (!focusSucceeds) return false;
                        focusedCoordinates.push(coordinate);
                        following = false;
                        return true;
                    },
                }),
            );
            effects.splice(0).forEach((effect) => effect());
        } while (dirty);
        return {
            card: tree.find((node) => node.type === 'ManeuverCard').props,
            sheet: tree.find((node) => node.type === 'StepsSheet').props,
            speed: tree.find(
                (node) => node.props.testID === 'driving-speed-status',
            ).props,
            road: tree.find((node) => node.type === 'RoadStack').props,
        };
    }
    let view = render();
    assert.equal(view.card.isFocused, false);
    view.card.onStepFocus(steps[1].coordinate, 1);
    view = render();
    assert.equal(view.card.isFocused, true);
    assert.equal(view.speed.className, 'opacity-0');
    assert.equal(view.road.isHidden, true);
    assert.equal(view.card.nextManeuver, null);
    activeIndex = 2;
    assert.equal(render().card.maneuver.stepIndex, 1);
    view.card.onPreviousStep();
    view = render();
    assert.equal(view.card.maneuver.stepIndex, 0);
    assert.equal(view.card.onPreviousStep, undefined);
    view.card.onNextStep();
    view = render();
    view.card.onNextStep();
    view = render();
    assert.equal(view.card.maneuver.stepIndex, 2);
    assert.equal(view.card.onNextStep, undefined);
    activeIndex = 1;
    following = true;
    view = render();
    assert.equal(view.card.isFocused, false);
    assert.equal(view.card.maneuver.stepIndex, activeIndex);
    assert.equal(view.speed.className, 'opacity-100');
    assert.equal(view.road.isHidden, false);
    assert.equal(view.card.nextManeuver, steps[2]);
    focusSucceeds = false;
    view.card.onStepFocus(steps[0].coordinate, 0);
    assert.equal(render().card.isFocused, false);
    focusSucceeds = true;
    view.sheet.onStepFocus(steps[0].coordinate, 0);
    assert.equal(render().card.maneuver.stepIndex, 0);
    route = { steps: [...steps] };
    assert.equal(render().card.isFocused, false);
    assert.deepEqual(focusedCoordinates, [
        steps[1].coordinate,
        steps[0].coordinate,
        steps[1].coordinate,
        steps[2].coordinate,
        steps[0].coordinate,
    ]);
});
