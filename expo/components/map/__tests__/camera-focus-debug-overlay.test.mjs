import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as debugOverlays from '../debug-overlays.js';
import { loadTourModule } from './tour-test-helpers.mjs';

const viewport = { windowHeight: 320, windowWidth: 480 };
const safeAreaInsets = { bottom: 24, left: 64, right: 16, top: 12 };
const padding = {
    paddingBottom: 24,
    paddingLeft: 64,
    paddingRight: 16,
    paddingTop: 160,
};
const nativeViews = { Text: 'Text', View: 'View' };
const { CameraFocusDebugOverlay } = loadTourModule(
    new URL('../camera-focus-debug-overlay.js', import.meta.url),
    { 'react-native': nativeViews },
);

function flatten(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node.type === 'function') return flatten(node.type(node.props));
    return [node, ...flatten(node.props?.children)];
}

test('driving diagnostics mark the safe area, padded viewport, and viewport center', () => {
    const nodes = flatten(
        CameraFocusDebugOverlay({
            ...viewport,
            focusState: { padding, safeAreaInsets },
        }),
    );
    const find = (name) =>
        nodes.find(
            (node) => node.props.testID === `camera-focus-debug-${name}`,
        );

    assert.equal(nodes[0].props.pointerEvents, 'none');
    assert.deepEqual(find('safe-area').props.style, {
        height: 284,
        left: 64,
        top: 12,
        width: 400,
    });
    assert.deepEqual(find('viewport').props.style, {
        height: 136,
        left: 64,
        top: 160,
        width: 400,
    });
    const target = find('target').props.style;
    assert.equal(target.left + target.width / 2, 264);
    assert.equal(target.top + target.height / 2, 228);
    assert.ok(nodes.some(({ props }) => props.children === 'Road pill'));
});

test('phone driving supplies live follow padding and clears the target when follow pauses', () => {
    const { useMapDebugControlsContextValue } = loadTourModule(
        new URL('../map-screen-context.js', import.meta.url),
        { react: { createContext: () => ({}), useMemo: (create) => create() } },
    );

    for (const enabled of [true, false]) {
        const { cameraFocusDebugState } = useMapDebugControlsContextValue({
            isDrivingMode: true,
            locationController: {
                nativeCameraFollowProps: { enabled, padding },
            },
            presentation: { insets: safeAreaInsets },
            searchController: { submittedSearchResults: [] },
        });
        assert.deepEqual(cameraFocusDebugState, {
            padding: enabled ? padding : null,
            safeAreaInsets,
        });
        const nodes = flatten(
            CameraFocusDebugOverlay({
                ...viewport,
                focusState: cameraFocusDebugState,
            }),
        );
        assert.equal(
            nodes.some(
                ({ props }) => props.testID === 'camera-focus-debug-target',
            ),
            enabled,
        );
        assert.equal(
            nodes.some(
                ({ props }) => props.children === 'Puck follow inactive',
            ),
            !enabled,
        );
    }
});

test('the phone shows Camera Focus even while other map chrome is hidden', () => {
    const { MapDebugControls } = loadTourModule(
        new URL('../map-debug-controls.js', import.meta.url),
        {
            'react-native': {
                ...nativeViews,
                useWindowDimensions: () => ({ height: 800, width: 400 }),
            },
            './camera-focus-debug-overlay': { CameraFocusDebugOverlay },
            './config': { SHOW_MAP_DEBUG_CONTROLS: true },
            './debug-overlay-stack': {},
            './debug-overlays': debugOverlays,
            './map-screen-context': {
                useDebugControlsContext: () => ({
                    cameraFocusDebugState: { padding, safeAreaInsets },
                    debugOverlayVisibility: {
                        [debugOverlays.DEBUG_OVERLAY_CAMERA_FOCUS]: true,
                    },
                    mapPreferencesAreLoaded: true,
                }),
            },
            './safe-area-debug-overlay': {},
        },
    );
    assert.ok(
        flatten(MapDebugControls({ mapChromeIsVisible: false })).some(
            ({ props }) => props.testID === 'camera-focus-debug-target',
        ),
    );
});

test('secondary car surfaces can render Camera Focus with their own host insets', () => {
    const { AutoPlayDebugOverlays } = loadTourModule(
        new URL('../../auto-play-debug-overlays.js', import.meta.url),
        {
            'react-native': nativeViews,
            './map/alpr-presence-debug-pane': {},
            './map/camera-debug-overlay': {
                CameraDebugOverlay: 'CameraDebugOverlay',
            },
            './map/camera-focus-debug-overlay': { CameraFocusDebugOverlay },
            './map/debug-overlays': debugOverlays,
            './map/location-debug-overlay': {},
            './map/upcoming-alert-debug-pane': {},
        },
    );
    const props = {
        controller: { nativeCameraFollowProps: { enabled: true, padding } },
        debugOverlayVisibility: { [debugOverlays.DEBUG_OVERLAY_CAMERA]: true },
        debugOverlaysAreVisible: false,
        isDrivingMode: true,
        safeAreaInsets,
        viewportMetrics: {
            height: viewport.windowHeight,
            width: viewport.windowWidth,
        },
    };
    const nodes = flatten(
        AutoPlayDebugOverlays({
            ...props,
            cameraFocusDebugOverlayIsVisible: true,
        }),
    );
    assert.ok(
        nodes.some(({ props }) => props.testID === 'camera-focus-debug-target'),
    );
    assert.ok(
        nodes.some(
            ({ props }) => props.testID === 'camera-focus-debug-safe-area',
        ),
    );
    assert.ok(!nodes.some(({ type }) => type === 'CameraDebugOverlay'));
    assert.equal(AutoPlayDebugOverlays(props), null);

    const surfaceSource = readFileSync(
        new URL('../../auto-play-map-surface-content.js', import.meta.url),
        'utf8',
    );
    assert.ok(
        /const cameraFocusDebugOverlayIsVisible =\s*SHOW_MAP_DEBUG_CONTROLS &&\s*debugOverlayVisibility\?\.\[DEBUG_OVERLAY_CAMERA_FOCUS\] === true;/.test(
            surfaceSource,
        ),
        'the shared surface must honor Camera Focus without a root display check',
    );
});
