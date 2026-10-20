import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG } from '../../android-auto-cluster-state.js';
import * as roadState from '../current-road-state.js';
import { shouldShowCurrentRoadPill } from '../current-road-pill-layout.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const element = (type, props) => ({ type, props });
const common = {
    react: {
        useState: (initial) => [
            typeof initial === 'function' ? initial() : initial,
            () => {},
        ],
        useEffect() {},
        useCallback: (callback) => callback,
        useRef: (current) => ({ current }),
    },
    'react-native': {
        useColorScheme: () => 'light',
        Text: 'Text',
        View: 'View',
        ActivityIndicator: 'ActivityIndicator',
    },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
};

function loadComponent(path, dependencies) {
    const { code } = transformSync(
        readFileSync(new URL(path, import.meta.url), 'utf8'),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
                '@babel/plugin-transform-modules-commonjs',
            ],
        },
    );
    const module = { exports: {} };
    const mocks = { ...common, ...dependencies };
    new Function('require', 'module', 'exports', code)(
        (name) => {
            assert.ok(name in mocks, `unexpected dependency: ${name}`);
            return mocks[name];
        },
        module,
        module.exports,
    );
    return module.exports;
}

const roadContext = loadComponent('../current-road-context.js', {
    './current-road-state': roadState,
});
const roadStack = loadComponent('../driving-location-road-stack.js', {
    './current-road-context': roadContext,
    './current-road-pill-layout': { shouldShowCurrentRoadPill },
    './navigation-puck-layout': {
        NAVIGATION_PUCK_SIZE: 62.5,
        getNavigationPuckAnchorY: () => null,
    },
});
const { AutoPlayMapStatusOverlay } = loadComponent(
    '../../auto-play-map-status-overlay.js',
    {
        './auto-play-map-status-layout': {
            getAutoPlayCurrentRoadPillLayout: () => null,
            getAutoPlaySpeedLimitBadgeSize: () => 56,
            getAutoPlaySpeedLimitOverlayLayout: () => ({ positionStyle: {} }),
            getAutoPlayTopRightStatusOverlayLayout: () => ({}),
        },
        './design-system/tokens': { dafSemanticColors: {} },
        './map/driving-location-road-stack': roadStack,
        './map/marker-loading-indicator': {
            MarkerLoadingIndicator: 'MarkerLoadingIndicator',
        },
        './map/navigation-puck-layout': {
            AUTO_PLAY_NAVIGATION_PUCK_SIZE: 62.5,
        },
        './map/speed-limit': {
            getCurrentSpeedMph: () => 30,
            getRouteCurrentSpeedMps: () => 13.4,
            useRouteSpeedLimit: () => ({ speedLimitMph: 35 }),
            SpeedLimitSign: 'SpeedLimitSign',
        },
        './map/speed-limit-layout': { AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE: 56 },
    },
);

function flatten(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node.type === 'function') return flatten(node.type(node.props));
    return [node, ...flatten(node.props?.children)];
}

const userLocation = {
    roadMatch: { roadContext: { primaryText: 'Main Street' } },
};
function renderOverlay(overrides = {}) {
    return flatten(
        AutoPlayMapStatusOverlay({
            currentRoadPill:
                ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG.currentRoadPill,
            currentRoadPillIsVisible: true,
            statusChromeIsVisible: false,
            rendersSpeedLimit: false,
            isDarkMode: false,
            userLocation,
            markerLoader: { renderMarkerLoadingIndicator: true },
            mapPreferencesAreLoaded: true,
            presentation: { mapControlLayoutInsets: {} },
            viewportMetrics: { cameraPadding: { paddingBottom: 24 } },
            ...overrides,
        }),
    );
}

test('the cluster renders a compact named-road pill below the measured puck slot without speed or loading status', () => {
    const nodes = renderOverlay();
    const pill = nodes.find(
        (node) => node.props.testID === 'android-auto-current-road-pill',
    );
    assert.ok(pill);
    assert.match(pill.props.className, /px-2\.5 py-1/);
    const text = nodes.find((node) => node.type === 'Text');
    assert.equal(text.props.children, 'Main Street');
    assert.match(text.props.className, /text-\[14px\] leading-\[20px\]/);
    assert.ok(
        nodes.find(
            (node) => node.props.testID === 'driving-location-puck-layout-slot',
        ),
    );
    assert.equal(
        nodes.some((node) =>
            ['SpeedLimitSign', 'MarkerLoadingIndicator'].includes(node.type),
        ),
        false,
    );
});

test('the cluster hides the road pill without a known road or during confirmation', () => {
    for (const overrides of [
        { userLocation: null },
        { userLocation: { roadMatch: { roadContext: { primaryText: ' ' } } } },
        { confirmationIsActive: true },
    ]) {
        assert.equal(
            renderOverlay(overrides).some(
                (node) =>
                    node.props.testID === 'android-auto-current-road-pill',
            ),
            false,
        );
    }
});

test('other surfaces retain their road-pill visibility and size defaults', () => {
    const hidden = renderOverlay({
        currentRoadPillIsVisible: undefined,
        currentRoadPill: undefined,
    });
    assert.equal(
        hidden.some(
            (node) => node.props.testID === 'android-auto-current-road-pill',
        ),
        false,
    );
    const main = renderOverlay({
        currentRoadPillIsVisible: undefined,
        currentRoadPill: undefined,
        statusChromeIsVisible: true,
    });
    const pill = main.find(
        (node) => node.props.testID === 'android-auto-current-road-pill',
    );
    assert.match(pill.props.className, /px-3 py-1\.5/);
    assert.match(
        main.find((node) => node.type === 'Text').props.className,
        /text-\[16px\] leading-\[22px\]/,
    );
});

test('the cluster enables its road pill independently of other overlays', () => {
    const source = readFileSync(
        new URL('../../auto-play-map-surface-content.js', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /currentRoadPillIsVisible=\{\s*\(rendersAppOverlays \|\| isClusterMapSurface\) &&\s*!searchResultsMapIsActive/,
    );
    assert.match(
        source,
        /statusChromeIsVisible=\{\s*rendersAppOverlays && !searchResultsMapIsActive/,
    );
});
