import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as debugOverlays from '../debug-overlays.js';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

test('every car map surface can draw its safe area independently of main display diagnostics', () => {
    assert.ok(
        /const safeAreaDebugOverlayIsVisible =\s*SHOW_MAP_DEBUG_CONTROLS &&\s*debugOverlayVisibility\?\.\[DEBUG_OVERLAY_SAFE_AREA\] === true;/.test(
            mapSurfaceSource,
        ),
        'the shared safe-area toggle must apply to secondary displays',
    );
    assert.ok(
        /\{safeAreaDebugOverlayIsVisible \? \(\s*<SafeAreaDebugOverlay\s+controlInsets=\{presentation\.mapControlLayoutInsets\}\s+insets=\{presentation\.insets\}\s+sceneInsets=\{\s*isCarPlay \? autoPlaySafeAreaInsets : undefined\s*\}\s+surfaceLabel=\{safeAreaDebugSurfaceLabel\}\s*\/>\s*\) : null\}/.test(
            mapSurfaceSource,
        ),
        'the map surface must draw its own insets when the toggle is on',
    );
});

function findElement(node, testID) {
    if (Array.isArray(node)) {
        return node.map((child) => findElement(child, testID)).find(Boolean);
    }

    if (!node?.props) {
        return undefined;
    }

    return node.props.testID === testID
        ? node
        : findElement(node.props.children, testID);
}

test('the iOS safe-area toggle stays visible when map chrome is hidden', () => {
    let isEnabled = true;
    const { MapDebugControls } = loadTourModule(
        new URL('../map-debug-controls.js', import.meta.url),
        {
            'react-native': {
                Platform: { OS: 'ios' },
                useWindowDimensions: () => ({ height: 800, width: 400 }),
            },
            './camera-focus-debug-overlay': {},
            './config': { SHOW_MAP_DEBUG_CONTROLS: true },
            './debug-overlay-stack': {},
            './debug-overlays': debugOverlays,
            './map-screen-context': {
                useDebugControlsContext: () => ({
                    debugOverlayVisibility: { safeArea: isEnabled },
                    mapPreferencesAreLoaded: true,
                }),
            },
            './safe-area-debug-overlay': {
                SafeAreaDebugOverlay: 'SafeAreaDebugOverlay',
            },
        },
    );

    const render = () => MapDebugControls({ mapChromeIsVisible: false });
    assert.equal(render().props.children[0]?.props.surfaceLabel, 'iOS map');
    isEnabled = false;
    assert.equal(render().props.children[0], null);
});

test('the overlay draws the reported area and displays both CarPlay inset sources', () => {
    const harness = createHookHarness();
    let nativeInsets = { top: 0, right: 0, bottom: 68, left: 0 };
    const sceneInsets = { top: 20, right: 8, bottom: 0, left: 26 };
    const insets = { ...sceneInsets, left: 24 };
    const controlInsets = { top: 32, right: 20, bottom: 12, left: 36 };
    const { SafeAreaDebugOverlay } = loadTourModule(
        new URL('../safe-area-debug-overlay.js', import.meta.url),
        {
            react: harness.react,
            'react-native': { View: 'View', Text: 'Text' },
            'react-native-safe-area-context': {
                useSafeAreaInsets: () => nativeInsets,
            },
        },
    );
    const props = {
        controlInsets,
        insets,
        sceneInsets,
        surfaceLabel: 'CarPlay instrument cluster',
    };
    const render = (overrides = {}) =>
        harness.render(() => SafeAreaDebugOverlay({ ...props, ...overrides }));
    const overlay = render();

    assert.equal(overlay.props.pointerEvents, 'none');
    assert.deepEqual(
        findElement(overlay, 'safe-area-debug-source-frame').props.style,
        sceneInsets,
    );
    assert.deepEqual(
        findElement(overlay, 'safe-area-debug-control-frame').props.style,
        controlInsets,
    );

    overlay.props.onLayout({
        nativeEvent: { layout: { width: 480, height: 320 } },
    });
    nativeInsets = { ...nativeInsets, bottom: 84 };
    const updated = render({ sceneInsets: { ...sceneInsets, bottom: 54 } });
    const readout = (name) =>
        findElement(updated, `safe-area-debug-${name}`).props.children.join('');

    assert.match(readout('surface'), /CarPlay instrument cluster.*480 × 320/);
    assert.match(readout('source'), /Auto Play.*T 20.*R 8.*B 54.*L 26/);
    assert.match(readout('native'), /UIKit view.*B 84/);
    assert.match(readout('map'), /Map.*L 24/);
    assert.match(readout('controls'), /Controls.*B 12/);

    const phone = render({ sceneInsets: undefined, surfaceLabel: 'iOS map' });
    assert.deepEqual(
        findElement(phone, 'safe-area-debug-source-frame').props.style,
        nativeInsets,
    );
    assert.equal(findElement(phone, 'safe-area-debug-native'), undefined);
});
