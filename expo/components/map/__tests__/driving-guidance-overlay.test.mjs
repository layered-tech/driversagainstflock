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

test('paused and resumed follow toggle visibility while keeping the speed and road components mounted', () => {
    const { DrivingGuidanceOverlay } = loadComponent(
        drivingGuidanceOverlaySource,
        {
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
        },
    );
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
