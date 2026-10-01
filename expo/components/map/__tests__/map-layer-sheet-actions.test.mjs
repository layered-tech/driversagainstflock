import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonjs = require('@babel/plugin-transform-modules-commonjs');
const typescript = require('@babel/plugin-transform-typescript');
const jsx = require('@babel/plugin-transform-react-jsx');

function createScheduler() {
    let nextId = 0;
    const frames = new Map();
    const timers = new Map();
    return {
        requestAnimationFrame: (fn) => {
            frames.set(++nextId, fn);
            return nextId;
        },
        cancelAnimationFrame: (id) => frames.delete(id),
        setTimeout: (fn) => {
            timers.set(++nextId, fn);
            return nextId;
        },
        clearTimeout: (id) => timers.delete(id),
        flushFrames() {
            const batch = [...frames.values()];
            frames.clear();
            batch.forEach((fn) => fn());
        },
        flushTimers() {
            const batch = [...timers.values()];
            timers.clear();
            batch.forEach((fn) => fn());
        },
        count: () => frames.size + timers.size,
    };
}
function createReactHarness() {
    const slots = [],
        cleanups = [];
    let cursor = 0;
    return {
        reset: () => {
            cursor = 0;
        },
        cleanup: () => cleanups.forEach((fn) => fn?.()),
        react: {
            useCallback: (fn) => fn,
            useMemo: (fn) => fn(),
            useEffect: (fn) => cleanups.push(fn()),
            useRef: (initial) => (slots[cursor++] ??= { current: initial }),
            useState: (initial) => {
                const index = cursor++;
                if (!(index in slots)) slots[index] = initial;
                return [
                    slots[index],
                    (next) => {
                        slots[index] =
                            typeof next === 'function'
                                ? next(slots[index])
                                : next;
                    },
                ];
            },
            useImperativeHandle: (ref, fn) => {
                ref.current = fn();
            },
            forwardRef: (fn) => fn,
            memo: (fn) => fn,
            createElement: (type, props, ...children) => ({
                type,
                props: { ...props, children },
            }),
            Fragment: 'Fragment',
        },
    };
}
function loadModule(url, mocks, scheduler, isTypescript = false) {
    const { code } = transformSync(readFileSync(url, 'utf8'), {
        filename: url.pathname,
        babelrc: false,
        configFile: false,
        plugins: [
            ...(isTypescript
                ? [[typescript, { isTSX: true, allExtensions: true }], jsx]
                : []),
            commonjs,
        ],
    });
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'clearTimeout',
        '__DEV__',
        code,
    )(
        (name) => {
            assert.ok(name in mocks, `Missing mock: ${name}`);
            return mocks[name];
        },
        module,
        module.exports,
        scheduler.requestAnimationFrame,
        scheduler.cancelAnimationFrame,
        scheduler.setTimeout,
        scheduler.clearTimeout,
        false,
    );
    return module.exports;
}
function createActions(scheduler = createScheduler()) {
    const react = createReactHarness();
    const { useMapLayerSheetActions } = loadModule(
        new URL('../use-map-layer-sheet-actions.js', import.meta.url),
        {
            react: react.react,
            './analytics': {
                logMapLayerSelected() {},
                logMapLightPresetSelected() {},
                logMapPoliceAlertsToggled() {},
                logMapTrafficToggled() {},
            },
            './constants': { MAP_LAYER_STYLES: [] },
        },
        scheduler,
    );
    const render = () => {
        react.reset();
        return useMapLayerSheetActions({
            setMapStyleURL() {},
            setMapLightPresetPreference() {},
            setMapTrafficEnabled() {},
            setPoliceAlertsVisible() {},
        });
    };
    return { actions: render(), render, scheduler, cleanup: react.cleanup };
}
function createInstalledModal(ref, props, scheduler) {
    const react = createReactHarness();
    const { default: Modal } = loadModule(
        new URL(
            '../../../node_modules/@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal.tsx',
            import.meta.url,
        ),
        {
            react: react.react,
            '@gorhom/portal': {
                Portal: 'Portal',
                usePortal: () => ({ removePortal() {} }),
            },
            '../../hooks': {
                useBottomSheetModalInternal: () => ({
                    hostName: 'test',
                    containerLayoutState: {},
                    mountSheet() {},
                    unmountSheet() {},
                    willUnmountSheet() {},
                }),
            },
            '../../utilities': { print() {} },
            '../../utilities/id': { id: () => 'sheet' },
            '../bottomSheet': 'BottomSheet',
            './constants': {
                DEFAULT_STACK_BEHAVIOR: 'switch',
                DEFAULT_ENABLE_DISMISS_ON_CLOSE: true,
                MODAL_STATUS: {
                    INITIAL: 0,
                    PRESENTED: 1,
                    CLOSED: 2,
                    MINIMIZED: 3,
                    MINIMIZING: 4,
                    ANIMATING: 5,
                    DISMISSING: 6,
                    DISMISSED: 7,
                },
            },
        },
        scheduler,
        true,
    );
    const render = () => {
        react.reset();
        return Modal(props, ref);
    };
    render();
    return { render };
}

test('starting driving before ever opening settings does not poison the first presentation', () => {
    const h = createActions();
    const modal = createInstalledModal(
        h.actions.layerSheetRef,
        { snapPoints: [500] },
        h.scheduler,
    );
    const { useStartDrivingAction } = loadModule(
        new URL('../use-driving-mode-lifecycle.js', import.meta.url),
        {
            react: createReactHarness().react,
            'react-native': { Platform: { OS: 'android' } },
            './analytics': { logMapDrivingStarted() {} },
        },
        h.scheduler,
    );
    const start = useStartDrivingAction({
        directionsRoute: {},
        selectedDirectionsRouteOption: {},
        layerSheetRef: h.actions.layerSheetRef,
        dismissMapLayerSheet: h.actions.dismissMapLayerSheet,
        searchController: { dismissDirectionsRouteSheet() {} },
        setDrivingModeIsActive() {},
    });
    start();
    h.actions.handleMapLayerPress();
    h.scheduler.flushFrames();
    const portal = modal.render();
    assert.ok(portal);
    let rendered = false;
    portal.props.handleOnMount(() => {
        rendered = true;
    });
    assert.equal(
        rendered,
        true,
        'The actual installed modal must render its content on the first press',
    );
    h.cleanup();
});

test('a minimized settings sheet can be presented again without waiting for onDismiss', () => {
    const h = createActions();
    let presentations = 0;
    h.actions.layerSheetRef.current = {
        present: () => presentations++,
        dismiss() {},
    };
    h.actions.handleMapLayerPress();
    h.scheduler.flushFrames();
    h.actions.handleMapLayerSheetChange(0);
    h.actions.handleMapLayerSheetAnimate(0, -1);
    h.actions.handleMapLayerSheetChange(-1);
    h.actions.handleMapLayerPress();
    h.scheduler.flushFrames();
    assert.equal(presentations, 2);
    h.cleanup();
});

test('a press during dismissal is replayed after dismissal finishes', () => {
    const h = createActions();
    let presentations = 0;
    h.actions.layerSheetRef.current = {
        present: () => presentations++,
        dismiss() {},
    };
    h.actions.handleMapLayerSheetChange(0);
    h.actions.handleMapLayerSelect('style');
    h.actions.handleMapLayerPress();
    assert.equal(presentations, 0);
    h.actions.handleMapLayerSheetDismiss();
    h.scheduler.flushFrames();
    assert.equal(presentations, 1);
    h.cleanup();
});

test('a first press survives a ref that attaches later than one animation frame', () => {
    const h = createActions();
    h.actions.handleMapLayerPress();
    h.scheduler.flushFrames();
    let presentations = 0;
    h.actions.layerSheetRef.current = {
        present: () => presentations++,
        dismiss() {},
    };
    h.scheduler.flushTimers();
    h.scheduler.flushFrames();
    assert.equal(presentations, 1);
    h.cleanup();
});

test('unmount cancels a queued opening and a late dismissal cannot replay it', () => {
    const h = createActions();
    h.actions.handleMapLayerPress();
    assert.ok(h.scheduler.count() > 0);
    h.cleanup();
    h.actions.handleMapLayerSheetDismiss();
    h.scheduler.flushFrames();
    h.scheduler.flushTimers();
    assert.equal(h.scheduler.count(), 0);
});
