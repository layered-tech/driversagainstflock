import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { AUTO_PLAY_CLUSTER_PLATFORM_CONFIG } from '../../auto-play-cluster-state.js';
import * as roadState from '../current-road-state.js';
import * as roadPillLayout from '../current-road-pill-layout.js';

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
        Platform: { OS: 'android' },
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
    './current-road-pill-layout': roadPillLayout,
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
        './map/current-road-pill-layout': roadPillLayout,
        './map/driving-location-road-stack': roadStack,
        './map/marker-loading-indicator': {
            MarkerLoadingIndicator: 'MarkerLoadingIndicator',
        },
        './map/navigation-puck-layout': {
            AUTO_PLAY_NAVIGATION_PUCK_SIZE: 62.5,
        },
        './map/speed-limit': {
            getCurrentSpeedMph: () => 30,
            useDisplayedCurrentSpeedMps: () => 13.4,
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
            currentRoadPill: AUTO_PLAY_CLUSTER_PLATFORM_CONFIG.currentRoadPill,
            currentRoadPillIsVisible: true,
            statusChromeIsVisible: false,
            rendersSpeedLimit: false,
            isDarkMode: false,
            userLocation,
            markerLoader: { renderMarkerLoadingIndicator: true },
            mapPreferencesAreLoaded: true,
            presentation: { mapControlLayoutInsets: {} },
            viewportMetrics: {
                height: 320,
                cameraPadding: { paddingBottom: 24 },
            },
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
    assert.match(text.props.className, /text-\[13px\] leading-\[18px\]/);
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

test('Camera Focus outlines the rendered road pill without changing its layout', () => {
    function getPill(overrides) {
        return renderOverlay(overrides).find(
            ({ props }) => props.testID === 'android-auto-current-road-pill',
        );
    }

    const regularPill = getPill({});
    const outlinedPill = getPill({ debugRoadPillOutlineIsVisible: true });
    assert.equal(outlinedPill.props.className, regularPill.props.className);
    assert.equal(outlinedPill.props.style, regularPill.props.style);
    assert.ok(
        !flatten(regularPill).some(
            ({ props }) => props.testID === 'current-road-pill-debug-outline',
        ),
    );
    const outline = flatten(outlinedPill).find(
        ({ props }) => props.testID === 'current-road-pill-debug-outline',
    );
    assert.match(outline.props.className, /absolute inset-0/);
    assert.equal(outline.props.pointerEvents, 'none');
});

test('cluster places the road pill 10 points from the bottom inset and marks both gaps', () => {
    const rendered = renderOverlay({ debugRoadPillOutlineIsVisible: true });
    const slot = rendered.find(
        ({ props }) => props.testID === 'driving-location-puck-layout-slot',
    );
    const dock = rendered.find(({ props }) => props.style?.bottom === 24);
    assert.equal(dock.props.children.props.bottomInset, 24);
    assert.equal(flatten(dock.props.children)[0].props.style.paddingBottom, 10);
    assert.equal(slot.props.style.height / 2, 20);
    const labels = rendered
        .filter(({ type }) => type === 'Text')
        .map(({ props }) => [props.children].flat().join(''));
    assert.ok(labels.includes('20 pt to puck target'));
    assert.ok(labels.includes('10 pt to safe edge'));
});

test('a centered puck keeps the road pill dock and hides the puck spacing guide', () => {
    const rendered = renderOverlay({
        debugPuckGapIsVisible: false,
        debugRoadPillOutlineIsVisible: true,
    });
    const dock = rendered.find(({ props }) => props.style?.bottom === 24);
    assert.equal(flatten(dock.props.children)[0].props.style.paddingBottom, 10);
    assert.ok(
        rendered.some(
            ({ props }) => props.testID === 'android-auto-current-road-pill',
        ),
    );
    const labels = rendered
        .filter(({ type }) => type === 'Text')
        .map(({ props }) => [props.children].flat().join(''));
    assert.ok(labels.includes('10 pt to safe edge'));
    assert.ok(!labels.includes('20 pt to puck target'));
});

test('the Dashboard shows its current road and speed badge while other status chrome is hidden', () => {
    const nodes = renderOverlay({
        currentRoadPill: { textStyle: { fontSize: 11, lineHeight: 16 } },
        freeDriveIsActive: true,
        rendersSpeedLimit: true,
    });
    assert.ok(
        nodes.find(
            (node) => node.props.testID === 'android-auto-current-road-pill',
        ),
    );
    assert.equal(
        nodes.find((node) => node.type === 'Text').props.children,
        'Main Street',
    );
    assert.ok(nodes.find((node) => node.type === 'SpeedLimitSign'));
    assert.equal(
        nodes.some((node) => node.type === 'MarkerLoadingIndicator'),
        false,
    );
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
        /currentRoadPillIsVisible=\{\s*\(rendersAppOverlays \|\|\s*isClusterMapSurface \|\|\s*isDashboardMapSurface\) &&\s*!searchResultsMapIsActive/,
    );
    assert.match(
        source,
        /statusChromeIsVisible=\{\s*rendersAppOverlays && !searchResultsMapIsActive/,
    );
});
