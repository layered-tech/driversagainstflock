import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import {
    CONTRIBUTE_TOUR_PHASE_STEPS,
    CONTRIBUTE_TOUR_STORAGE_KEY,
    createContributeTourProgress,
    getVisibleContributeTourStep,
    readContributeTourProgress,
    updateContributeTourProgress,
    writeContributeTourProgress,
} from '../../contribute/contribute-tour-state.js';

import {
    getContributeTourBackdropPath,
    getContributeTourLayout,
} from '../../contribute/contribute-tour-layout.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonjs = require('@babel/plugin-transform-modules-commonjs');
const jsx = require('@babel/plugin-transform-react-jsx');

function loadComponent(file, mocks, scheduler = {}) {
    const { code } = transformSync(
        readFileSync(
            new URL(`../../contribute/${file}`, import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [[jsx, { runtime: 'automatic' }], commonjs],
        },
    );
    const module = { exports: {} };
    const createElement = (type, props) => ({ type, props });

    new Function(
        'require',
        'module',
        'exports',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        code,
    )(
        (specifier) => {
            if (specifier === 'react/jsx-runtime') {
                return { jsx: createElement, jsxs: createElement };
            }

            assert.ok(specifier in mocks, `Missing mock: ${specifier}`);
            return mocks[specifier];
        },
        module,
        module.exports,
        scheduler.requestAnimationFrame,
        scheduler.cancelAnimationFrame,
    );

    return module.exports;
}

function createHookHarness() {
    const slots = [];
    let cursor = 0;
    let effects = [];
    let needsRender = false;

    function dependenciesChanged(previous, next) {
        return (
            !previous ||
            next.some((value, index) => !Object.is(value, previous[index]))
        );
    }

    return {
        react: {
            useState(initial) {
                const index = cursor++;

                if (!(index in slots)) {
                    slots[index] =
                        typeof initial === 'function' ? initial() : initial;
                }

                return [
                    slots[index],
                    (next) => {
                        const value =
                            typeof next === 'function'
                                ? next(slots[index])
                                : next;

                        if (!Object.is(value, slots[index])) {
                            slots[index] = value;
                            needsRender = true;
                        }
                    },
                ];
            },
            useRef(initial) {
                return (slots[cursor++] ??= { current: initial });
            },
            useEffect(effect, dependencies) {
                const index = cursor++;
                const previous = slots[index];

                if (dependenciesChanged(previous?.dependencies, dependencies)) {
                    effects.push(() => {
                        previous?.cleanup?.();
                        slots[index] = { dependencies, cleanup: effect() };
                    });
                }
            },
            useCallback(callback, dependencies) {
                const index = cursor++;

                if (
                    dependenciesChanged(
                        slots[index]?.dependencies,
                        dependencies,
                    )
                ) {
                    slots[index] = { dependencies, value: callback };
                }

                return slots[index].value;
            },
            useMemo(factory, dependencies) {
                const index = cursor++;

                if (
                    dependenciesChanged(
                        slots[index]?.dependencies,
                        dependencies,
                    )
                ) {
                    slots[index] = { dependencies, value: factory() };
                }

                return slots[index].value;
            },
        },
        render(renderHook) {
            let result;
            let renders = 0;

            do {
                assert.ok(++renders < 20, 'Hook effects must settle');
                needsRender = false;
                cursor = 0;
                effects = [];
                result = renderHook();
                effects.forEach((effect) => effect());
            } while (needsRender);

            return result;
        },
        cleanup() {
            slots.forEach((slot) => slot?.cleanup?.());
        },
    };
}

function createTourHarness({
    saved = null,
    deferRead = false,
    deferWrite = false,
} = {}) {
    let status = 'idle';
    let serialized = saved;
    let resolveRead;
    const writes = [];
    const removals = [];
    const pendingWrites = [];
    const hooks = createHookHarness();
    const storage = {
        getItem(key) {
            assert.equal(key, CONTRIBUTE_TOUR_STORAGE_KEY);
            return deferRead
                ? new Promise((resolve) => {
                      resolveRead = resolve;
                  })
                : Promise.resolve(serialized);
        },
        async setItem(key, value) {
            assert.equal(key, CONTRIBUTE_TOUR_STORAGE_KEY);
            writes.push(JSON.parse(value));

            if (deferWrite) {
                await new Promise((resolve) => pendingWrites.push(resolve));
            }

            serialized = value;
        },
        async removeItem(key) {
            assert.equal(key, CONTRIBUTE_TOUR_STORAGE_KEY);
            removals.push(key);
            serialized = null;
        },
    };
    const { useContributeTour } = loadComponent('use-contribute-tour.js', {
        '@react-native-async-storage/async-storage': storage,
        react: hooks.react,
        './contribute-tour-state': {
            CONTRIBUTE_TOUR_PHASE_STEPS,
            CONTRIBUTE_TOUR_STORAGE_KEY,
            createContributeTourProgress,
            readContributeTourProgress,
            updateContributeTourProgress,
            writeContributeTourProgress,
        },
    });
    const render = () => hooks.render(() => useContributeTour(status));

    return {
        render,
        storage,
        writes,
        removals,
        savedProgress: () => JSON.parse(serialized),
        setStatus(nextStatus) {
            status = nextStatus;
            return render();
        },
        finishRead: () => resolveRead(saved),
        finishWrite: () => pendingWrites.shift()?.(),
        cleanup: hooks.cleanup,
        async settle() {
            let result;

            for (let iteration = 0; iteration < 8; iteration++) {
                await Promise.resolve();
                result = render();
            }

            return result;
        },
    };
}

function findElement(tree, testID) {
    if (!tree || typeof tree !== 'object') {
        return null;
    }

    if (tree.props?.testID === testID) {
        return tree;
    }

    for (const child of [tree.props?.children].flat(Infinity)) {
        const found = findElement(child, testID);

        if (found) {
            return found;
        }
    }

    return null;
}

function getTourOverlays(tree) {
    if (!tree || typeof tree !== 'object') {
        return [];
    }

    return [
        ...(tree.type === 'TourOverlay' ? [tree.props] : []),
        ...[tree.props?.children].flat(Infinity).flatMap(getTourOverlays),
    ];
}

function createDebugDrawerHarness(reset) {
    const hooks = createHookHarness();
    let closeCount = 0;
    const tour = { progress: createContributeTourProgress(), reset };
    const debugKeys = [
        'ALPR_PRESENCE',
        'ANDROID_AUTO_LOCATION',
        'CAMERA',
        'CAMERA_FOCUS',
        'DIRECTIONS_GEOMETRY',
        'ELECTRONIC_HORIZON',
        'NETWORK',
        'SAFE_AREA',
        'UPCOMING_ALERTS',
        'WAZE',
    ];
    const { DebugDrawer } = loadComponent('../root/debug-drawer.js', {
        react: { ...hooks.react, Fragment: 'Fragment' },
        'react-native': {
            Animated: {
                Value: class {
                    interpolate() {
                        return 0;
                    }
                },
                timing: () => ({
                    start: (callback) => callback({ finished: true }),
                }),
                View: 'AnimatedView',
            },
            Easing: { cubic() {}, out: (value) => value },
            Pressable: 'Pressable',
            ScrollView: 'ScrollView',
            Text: 'Text',
            TextInput: 'TextInput',
            View: 'View',
            useColorScheme: () => 'light',
            useWindowDimensions: () => ({ width: 390 }),
        },
        '@fortawesome/free-solid-svg-icons': Object.fromEntries(
            [
                'faCamera',
                'faCodeBranch',
                'faCrosshairs',
                'faLocationDot',
                'faMobileScreen',
                'faNetworkWired',
                'faRoute',
                'faXmark',
            ].map((name) => [name, name]),
        ),
        '@fortawesome/react-native-fontawesome': { FontAwesomeIcon: 'Icon' },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ top: 44, bottom: 34 }),
        },
        '../contribute/contribute-state': { useContribute: () => ({ tour }) },
        '../android-auto-performance-trace': {
            formatAndroidAutoPerformanceTrace: () => '',
            getAndroidAutoPerformanceTraceAsync: async () => null,
        },
        '../map/alpr-presence-debug-pane': {
            AlprPresenceDebugPane: 'AlprPresenceDebugPane',
        },
        '../map/config': { SHOW_MAP_DEBUG_CONTROLS: true },
        '../map/constants': { MIN_ZOOM_LEVEL: 2, MAX_ZOOM_LEVEL: 20 },
        '../map/debug-camera-zoom': { setDebugCameraZoomLevel() {} },
        '../map/debug-overlays': Object.fromEntries(
            debugKeys.map((key) => [`DEBUG_OVERLAY_${key}`, key]),
        ),
        '../map/shared-map-state': {
            useSharedMapState: () => ({
                mapPreferencesAreLoaded: true,
                debugOverlayVisibility: {},
            }),
        },
        '../map/upcoming-alert-debug-pane': {
            UpcomingAlertDebugPane: 'UpcomingAlertDebugPane',
        },
        '../map/weather-debug-pane': { WeatherDebugPane: 'WeatherDebugPane' },
        './debug-drawer-toggle-row': {
            DebugDrawerToggleRow: 'DebugDrawerToggleRow',
        },
    });

    return {
        tour,
        closeCount: () => closeCount,
        render: () =>
            hooks.render(() =>
                DebugDrawer({
                    visible: true,
                    onClose: () => {
                        closeCount += 1;
                    },
                }),
            ),
    };
}

function createScreenHarness() {
    const dismissals = [];
    const routes = [];
    let publishCalls = 0;
    let screenIsFocused = true;
    const auth = {
        isAuthenticated: true,
        hasWriteScope: true,
        user: { name: 'mapper' },
    };
    const params = { index: '0' };
    const contribution = {
        contributeStatus: 'start-sheet',
        contributePlacementIsActive: true,
        changeset: { comment: '', source: 'survey', hashtags: '' },
        pins: [
            {
                id: 'camera-1',
                latitude: 30.267,
                longitude: -97.74,
                details: {},
            },
            {
                id: 'camera-2',
                latitude: 30.268,
                longitude: -97.741,
                details: {},
            },
        ],
        tour: {
            dismissStep: (step) => dismissals.push(step),
            dismissPhase: (phase) =>
                dismissals.push(...CONTRIBUTE_TOUR_PHASE_STEPS[phase]),
            skip() {},
            progress: updateContributeTourProgress(
                createContributeTourProgress(),
                { type: 'start' },
            ),
        },
        startPlacing: () => {
            contribution.contributeStatus = 'placing';
        },
        publishStatus: 'idle',
        publish: () => {
            publishCalls += 1;
        },
    };
    const mocks = {
        react: {
            useCallback: (callback) => callback,
            useEffect() {},
            useRef: (initial) => ({ current: initial }),
            useState: (initial) => [initial, () => {}],
        },
        'react-native': {
            Alert: { alert() {} },
            BackHandler: { addEventListener: () => ({ remove() {} }) },
            Pressable: 'Pressable',
            ScrollView: 'ScrollView',
            Text: 'Text',
            View: 'View',
            useColorScheme: () => 'light',
            useWindowDimensions: () => ({ height: 800 }),
        },
        'expo-router': {
            router: {
                push: (route) => routes.push(route),
                navigate: (route) => routes.push(route),
            },
            useFocusEffect() {},
            useIsFocused: () => screenIsFocused,
            useLocalSearchParams: () => params,
        },
        '@gorhom/bottom-sheet': { BottomSheetScrollView: 'ScrollView' },
        '../../lib/auth': { useAuth: () => auth },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ top: 20, bottom: 10 }),
        },
        '../../lib/use-prevent-remove': { usePreventRemove() {} },
        '../../lib/osm/camera-schema.js': {
            CAMERA_TYPE_OPTIONS: [],
            CAMERA_MANUFACTURER_OPTIONS: [],
            CAMERA_MOUNT_OPTIONS: [],
        },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': {
            DafBadge: 'Badge',
            DafButton: 'Button',
            DafIconButton: 'IconButton',
            DafChip: 'Chip',
            DafSectionLabel: 'SectionLabel',
            DafSegmentedControl: 'SegmentedControl',
            DafTextInput: 'TextInput',
        },
        '../design-system/tokens': {
            dafColors: { green: { 700: 'green' }, amber: { 600: 'orange' } },
            dafSemanticColors: {},
            getDafTheme: () => ({ text: { brand: 'green' } }),
        },
        '../map/native-components': {
            NativeWindBottomSheetModal: 'BottomSheetModal',
            NativeWindBottomSheetView: 'View',
        },
        '../map/use-bottom-sheet-presented-state': {
            useBottomSheetPresentedState: () => ({
                bottomSheetIsPresented: true,
            }),
        },
        './contribute-auth-progress': {
            ContributeAuthProgress: 'AuthProgress',
        },
        './contribute-state': { useContribute: () => contribution },
        './contribute-tour-overlay': { ContributeTourOverlay: 'TourOverlay' },
        './contribute-tour-target': { ContributeTourTarget: 'TourTarget' },
        '../map/constants': { MAP_CONTROL_BUTTON_CLASS_NAME: '' },
        '../map/map-control-button': { MapControlButton: 'MapControlButton' },
        './compass-dial': { CompassDial: 'CompassDial' },
        './osm-tags': { formatBearingChip: () => 'N' },
        './step-header': { ContributePageHeader: 'Header' },
        './contribute-draft-actions': { saveDraftBeforeExit: async () => true },
    };

    return {
        auth,
        contribution,
        dismissals,
        params,
        routes,
        publishCalls: () => publishCalls,
        setFocused: (focused) => {
            screenIsFocused = focused;
        },
        screen: (file) => loadComponent(file, mocks),
    };
}

describe('first contribution walkthrough', () => {
    test('reset after publication stays ready for the next contribution', async () => {
        const harness = createTourHarness({
            saved: JSON.stringify({
                version: 2,
                status: 'completed',
                dismissedSteps: [],
            }),
        });
        await harness.settle();
        const tour = harness.setStatus('published');
        await tour.reset();
        const resetTour = await harness.settle();
        assert.equal(resetTour.progress.status, 'pending');
        assert.equal(harness.savedProgress(), null);
        harness.setStatus('idle');
        const nextTour = harness.setStatus('start-sheet');
        assert.ok(getVisibleContributeTourStep(nextTour.progress, 'start'));
    });

    test('reset clears only saved tour history and makes the next attempt show the tour without a reload', async () => {
        const harness = createTourHarness({
            saved: JSON.stringify({
                version: 2,
                status: 'completed',
                dismissedSteps: ['start', 'directions'],
            }),
        });
        const tour = await harness.settle();
        await tour.reset();
        const resetTour = await harness.settle();

        assert.deepEqual(harness.removals, [CONTRIBUTE_TOUR_STORAGE_KEY]);
        assert.equal(harness.savedProgress(), null);
        assert.deepEqual(resetTour.progress, createContributeTourProgress());
        const replayTour = harness.setStatus('start-sheet');
        assert.ok(getVisibleContributeTourStep(replayTour.progress, 'start'));
    });

    test('reset waits for queued progress writes before removing the history', async () => {
        const harness = createTourHarness({ deferWrite: true });
        await harness.settle();
        harness.setStatus('start-sheet');
        const tour = await harness.settle();
        harness.setStatus('idle');
        const resetting = tour.reset();
        await harness.settle();
        assert.equal(harness.removals.length, 0);
        harness.finishWrite();
        await harness.settle();
        await resetting;
        await harness.settle();
        assert.equal(harness.savedProgress(), null);
        assert.equal(harness.render().progress.status, 'pending');
    });

    test('reports a storage reset failure without discarding current tour progress', async () => {
        const harness = createTourHarness({
            saved: JSON.stringify({
                version: 2,
                status: 'skipped',
                dismissedSteps: ['start'],
            }),
        });
        const tour = await harness.settle();
        harness.storage.removeItem = async () => {
            throw new Error('Storage unavailable');
        };
        await assert.rejects(tour.reset(), /Storage unavailable/);
        assert.equal(harness.render().progress.status, 'skipped');
        assert.equal(harness.savedProgress().status, 'skipped');
    });

    test('waits for a contribution attempt and handles opening before storage loads', async () => {
        const harness = createTourHarness({ deferRead: true });

        assert.equal(harness.render().progress, null);
        harness.setStatus('start-sheet');
        harness.finishRead();
        const tour = await harness.settle();

        assert.equal(tour.progress.status, 'active');
        assert.ok(getVisibleContributeTourStep(tour.progress, 'start'));
        assert.equal(harness.savedProgress().status, 'active');
    });

    test('does not start or write progress just from opening the app', async () => {
        const harness = createTourHarness();
        const tour = await harness.settle();

        assert.equal(tour.progress.status, 'pending');
        assert.equal(
            getVisibleContributeTourStep(tour.progress, 'start'),
            null,
        );
        assert.equal(harness.writes.length, 0);
    });

    test('continues across screens and draft exits, and completes only after publication', async () => {
        const harness = createTourHarness();
        await harness.settle();
        let tour = harness.setStatus('start-sheet');
        tour.dismissStep('start');
        tour = harness.setStatus('placing');

        assert.equal(
            getVisibleContributeTourStep(tour.progress, 'start'),
            null,
        );
        assert.ok(getVisibleContributeTourStep(tour.progress, 'placement'));
        tour.dismissStep('placement');
        tour.dismissStep('placed');
        tour = await harness.settle();
        assert.ok(
            getVisibleContributeTourStep(tour.progress, 'camera-details'),
        );
        assert.ok(getVisibleContributeTourStep(tour.progress, 'directions'));

        tour.dismissStep('camera-details');
        tour.dismissStep('directions');
        tour.dismissStep('changeset');
        harness.setStatus('idle');
        tour = await harness.settle();

        assert.equal(tour.progress.status, 'active');
        const resumed = createTourHarness({
            saved: JSON.stringify(harness.savedProgress()),
        });
        await resumed.settle();
        tour = resumed.setStatus('placing');

        assert.equal(
            getVisibleContributeTourStep(tour.progress, 'directions'),
            null,
        );
        assert.ok(getVisibleContributeTourStep(tour.progress, 'review'));
        // Showing review, or a failed publish that leaves the flow in placing,
        // must not consume the tour's successful completion.
        assert.equal(tour.progress.status, 'active');

        tour = resumed.setStatus('published');
        assert.equal(tour.progress.status, 'completed');
        assert.ok(getVisibleContributeTourStep(tour.progress, 'published'));
        tour.dismissStep('published');
        tour = await resumed.settle();
        assert.equal(
            getVisibleContributeTourStep(tour.progress, 'published'),
            null,
        );

        const nextLaunch = createTourHarness({
            saved: JSON.stringify(resumed.savedProgress()),
        });
        await nextLaunch.settle();
        tour = nextLaunch.setStatus('start-sheet');
        assert.equal(
            getVisibleContributeTourStep(tour.progress, 'start'),
            null,
        );
        assert.equal(
            getVisibleContributeTourStep(tour.progress, 'published'),
            null,
        );
    });

    test('persists skipping so later attempts and launches do not restart guidance', async () => {
        const harness = createTourHarness();
        await harness.settle();
        const tour = harness.setStatus('start-sheet');
        tour.skip();
        await harness.settle();
        harness.setStatus('idle');
        assert.equal(
            harness.setStatus('start-sheet').progress.status,
            'skipped',
        );

        const nextLaunch = createTourHarness({
            saved: JSON.stringify(harness.savedProgress()),
        });
        await nextLaunch.settle();
        assert.equal(
            nextLaunch.setStatus('placing').progress.status,
            'skipped',
        );
        assert.equal(
            nextLaunch.setStatus('published').progress.completionIsVisible,
            false,
        );
    });

    test('serializes slow writes so an old active state cannot overwrite skipping', async () => {
        const harness = createTourHarness({ deferWrite: true });
        await harness.settle();
        harness.setStatus('start-sheet');
        let tour = await harness.settle();
        assert.equal(harness.writes.length, 1);

        tour.dismissStep('start');
        await harness.settle();
        tour = harness.render();
        tour.skip();
        await harness.settle();
        assert.equal(harness.writes.length, 1);

        harness.finishWrite();
        await harness.settle();
        harness.finishWrite();
        await harness.settle();
        harness.finishWrite();
        await harness.settle();
        assert.equal(harness.savedProgress().status, 'skipped');
    });

    test('does not update an unmounted hook after storage finishes loading', async () => {
        const harness = createTourHarness({ deferRead: true });
        harness.render();
        harness.cleanup();
        harness.finishRead();
        await Promise.resolve();
        await Promise.resolve();

        assert.equal(harness.render().progress, null);
        assert.equal(harness.writes.length, 0);
    });
});

describe('debug menu contribution tour reset', () => {
    test('makes debug reset reachable in the e2e app while keeping production controls hidden', () => {
        for (const [environment, expected] of [
            ['development', true],
            ['staging', true],
            ['e2e', true],
            ['production', false],
            [undefined, false],
        ]) {
            const { SHOW_MAP_DEBUG_CONTROLS } = loadComponent(
                '../map/config.js',
                {
                    'expo-constants': {
                        __esModule: true,
                        default: { expoConfig: { extra: { environment } } },
                    },
                },
            );
            assert.equal(SHOW_MAP_DEBUG_CONTROLS, expected, environment);
        }
    });

    test('runs the tour reset from the button and shows pending and success feedback', async () => {
        let completeReset;
        const harness = createDebugDrawerHarness(
            () =>
                new Promise((resolve) => {
                    completeReset = resolve;
                }),
        );
        const button = findElement(
            harness.render(),
            'debug-drawer-reset-contribution-tour',
        );
        assert.equal(button.props.disabled, false);
        const resetting = button.props.onPress();
        const pending = findElement(
            harness.render(),
            'debug-drawer-reset-contribution-tour',
        );
        assert.equal(pending.props.disabled, true);
        assert.equal(pending.props.accessibilityState.busy, true);
        assert.equal(harness.closeCount(), 0);
        completeReset();
        await resetting;
        assert.equal(harness.closeCount(), 1);
        assert.ok(
            findElement(
                harness.render(),
                'debug-drawer-contribution-tour-reset-success',
            ),
        );
        assert.equal(
            findElement(
                harness.render(),
                'debug-drawer-reset-contribution-tour',
            ).props.disabled,
            false,
        );
    });

    test('waits for saved tour progress to load before allowing reset', () => {
        const harness = createDebugDrawerHarness(() =>
            assert.fail('Reset ran before loading completed'),
        );
        harness.tour.progress = null;
        assert.equal(
            findElement(
                harness.render(),
                'debug-drawer-reset-contribution-tour',
            ).props.disabled,
            true,
        );
    });

    test('shows an error and permits retry when storage reset fails', async () => {
        const harness = createDebugDrawerHarness(async () => {
            throw new Error('Storage unavailable');
        });
        await findElement(
            harness.render(),
            'debug-drawer-reset-contribution-tour',
        ).props.onPress();
        assert.ok(
            findElement(
                harness.render(),
                'debug-drawer-contribution-tour-reset-error',
            ),
        );
        assert.equal(harness.closeCount(), 0);
        assert.equal(
            findElement(
                harness.render(),
                'debug-drawer-contribution-tour-reset-success',
            ),
            null,
        );
        assert.equal(
            findElement(
                harness.render(),
                'debug-drawer-reset-contribution-tour',
            ).props.disabled,
            false,
        );
    });
});

describe('walkthrough storage', () => {
    test('treats missing, corrupt, or incompatible progress as a first attempt', async () => {
        for (const value of [
            null,
            '{',
            'null',
            '{}',
            JSON.stringify({ version: 2, status: 'completed' }),
        ]) {
            assert.deepEqual(
                await readContributeTourProgress({
                    getItem: async () => value,
                }),
                createContributeTourProgress(),
            );
        }

        assert.deepEqual(
            await readContributeTourProgress({
                getItem: async () => {
                    throw new Error('Storage unavailable');
                },
            }),
            createContributeTourProgress(),
        );
    });

    test('keeps only recognized tips and never restores a publication confirmation', async () => {
        const progress = await readContributeTourProgress({
            getItem: async () =>
                JSON.stringify({
                    version: 2,
                    status: 'completed',
                    dismissedSteps: ['directions', 'old-step', null],
                    completionIsVisible: true,
                }),
        });

        assert.deepEqual(progress.dismissedSteps, ['directions']);
        assert.equal(getVisibleContributeTourStep(progress, 'published'), null);
    });

    test('storage failures do not interrupt a real contribution', async () => {
        assert.equal(
            await writeContributeTourProgress(
                {
                    setItem: async () => {
                        throw new Error('Storage unavailable');
                    },
                },
                updateContributeTourProgress(createContributeTourProgress(), {
                    type: 'start',
                }),
            ),
            false,
        );
    });
});

function createOverlayHarness(phase = 'camera') {
    const hooks = createHookHarness();
    const frames = new Map();
    let nextFrame = 0;
    let enabled = true;
    let measured = 0;
    const scrolls = [];
    const dimensions = { width: 390, height: 844 };
    const rectangles = {
        start: { x: 24, y: 650, width: 342, height: 56 },
        'placement-map': { x: 166, y: 393, width: 58, height: 58 },
        placement: { x: 12, y: 116, width: 48, height: 48 },
        placed: { x: 24, y: 650, width: 342, height: 56 },
        'camera-details': { x: 16, y: 120, width: 358, height: 72 },
        manufacturer: { x: 16, y: 240, width: 358, height: 72 },
        operator: { x: 16, y: 120, width: 358, height: 72 },
        directions: { x: 16, y: 120, width: 358, height: 350 },
        mount: { x: 16, y: 120, width: 358, height: 72 },
        review: { x: 16, y: 120, width: 358, height: 72 },
        publish: { x: 16, y: 730, width: 358, height: 56 },
    };
    const targets = {
        current: Object.fromEntries(
            Object.entries(rectangles).map(([id, rectangle]) => [
                id,
                {
                    measureInWindow(callback) {
                        measured += 1;
                        callback(
                            rectangle.x,
                            rectangle.y,
                            rectangle.width,
                            rectangle.height,
                        );
                    },
                    measureLayout(_parent, callback) {
                        callback(rectangle.x, rectangle.y);
                    },
                },
            ]),
        ),
    };
    const scheduler = {
        requestAnimationFrame(callback) {
            frames.set(++nextFrame, callback);
            return nextFrame;
        },
        cancelAnimationFrame(id) {
            frames.delete(id);
        },
    };
    const tour = {
        progress: updateContributeTourProgress(createContributeTourProgress(), {
            type: 'start',
        }),
        dismissStep(step) {
            tour.progress = updateContributeTourProgress(tour.progress, {
                type: 'dismiss',
                step,
            });
        },
        reopenStep(step) {
            tour.progress = updateContributeTourProgress(tour.progress, {
                type: 'reopen',
                step,
            });
        },
        skip() {
            tour.progress = updateContributeTourProgress(tour.progress, {
                type: 'skip',
            });
        },
    };
    const { ContributeTourOverlay } = loadComponent(
        'contribute-tour-overlay.js',
        {
            react: hooks.react,
            'react-native': {
                Keyboard: { dismiss() {} },
                Modal: 'Modal',
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                Text: 'Text',
                View: 'View',
                useColorScheme: () => 'light',
                useWindowDimensions: () => dimensions,
            },
            'react-native-svg': {
                __esModule: true,
                default: 'Svg',
                Path: 'Path',
                Rect: 'Rect',
            },
            './contribute-tour-layout': {
                getContributeTourLayout,
                getContributeTourBackdropPath,
            },
            './contribute-tour-state': {
                CONTRIBUTE_TOUR_PHASE_STEPS,
                getVisibleContributeTourStep,
            },
        },
        scheduler,
    );
    // Ref objects must stay stable across renders, as they do in the app.
    const scrollRef = {
        current: { scrollTo: (options) => scrolls.push(options) },
    };
    const contentRef = { current: {} };
    const stableRender = () =>
        hooks.render(() =>
            ContributeTourOverlay({
                enabled,
                phase,
                tour,
                targets,
                scrollRef,
                contentRef,
                restoreScrollOnFinish: true,
                insets: { top: 44, bottom: 34, left: 0, right: 0 },
            }),
        );
    return {
        tour,
        rectangles,
        scrolls,
        render: stableRender,
        measured: () => measured,
        setEnabled(value) {
            enabled = value;
            return stableRender();
        },
        settle() {
            let tree = stableRender();
            for (let i = 0; i < 5; i++) {
                const batch = [...frames.values()];
                frames.clear();
                batch.forEach((callback) => callback());
                tree = stableRender();
            }
            return tree;
        },
    };
}

describe('spotlight walkthrough controls', () => {
    test('registers native targets without context and cleans up only the matching view', () => {
        const targets = { current: {} };
        const { ContributeTourTarget } = loadComponent(
            'contribute-tour-target.js',
            {
                react: {
                    useCallback: (callback) => callback,
                    useRef: () => ({ current: null }),
                },
                'react-native': { View: 'View' },
            },
        );
        const oldTarget = ContributeTourTarget({ id: 'start', targets });
        const newTarget = ContributeTourTarget({ id: 'start', targets });
        const firstView = { measureInWindow() {} };
        const secondView = { measureInWindow() {} };
        assert.equal(oldTarget.props.collapsable, false);
        oldTarget.props.ref(firstView);
        assert.equal(targets.current.start, firstView);
        newTarget.props.ref(secondView);
        oldTarget.props.ref(null);
        assert.equal(targets.current.start, secondView);
        newTarget.props.ref(null);
        assert.equal(targets.current.start, undefined);
    });

    test('renders a modal spotlight at the portal host without contribution or navigation context', () => {
        const harness = createOverlayHarness('start');
        const tree = harness.settle();
        assert.equal(tree.type, 'Modal');
        assert.equal(tree.props.transparent, true);
        const backdrop = findElement(tree, 'contribute-tour-backdrop');
        assert.equal(backdrop.props.fillRule, 'evenodd');
        assert.match(backdrop.props.d, /^M0 0H390V844H0Z M/);
        const highlight = findElement(tree, 'contribute-tour-spotlight').props;
        assert.equal(highlight.x, 18);
        assert.equal(highlight.width, 354);
        assert.ok(findElement(tree, 'contribute-tour-tooltip'));
    });

    test('hides guidance when disabled or the tour is inactive and cancels pending measurements', () => {
        const harness = createOverlayHarness();
        assert.equal(harness.render(), null);
        harness.setEnabled(false);
        assert.equal(harness.settle(), null);
        assert.equal(harness.measured(), 0);
        harness.setEnabled(true);
        assert.ok(harness.settle());
        harness.tour.progress = createContributeTourProgress();
        assert.equal(harness.render(), null);
    });

    test('keeps the modal mounted while Android expands its initial window and remeasures the sheet target', () => {
        const harness = createOverlayHarness('placed');
        harness.rectangles.placed.y = 790;
        let tree = harness.settle();
        const onLayout = findElement(tree, 'contribute-tour-placed').props
            .onLayout;

        onLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 760 } },
        });
        tree = harness.settle();
        assert.equal(tree?.type, 'Modal');
        assert.equal(findElement(tree, 'contribute-tour-tooltip'), null);

        // The bottom sheet has finished resizing when the full modal window arrives.
        harness.rectangles.placed.y = 700;
        onLayout({
            nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
        });
        tree = harness.settle();
        assert.ok(findElement(tree, 'contribute-tour-tooltip'));
        assert.equal(
            findElement(tree, 'contribute-tour-spotlight').props.y,
            694,
        );
    });

    test('Next and Back move the highlight between real controls without closing the modal', () => {
        const harness = createOverlayHarness();
        let tree = harness.settle();
        findElement(
            tree,
            'contribute-tour-dismiss-camera-details',
        ).props.onPress();
        assert.equal(harness.render().type, 'Modal');
        tree = harness.settle();
        assert.equal(
            findElement(tree, 'contribute-tour-spotlight').props.y,
            234,
        );
        assert.ok(findElement(tree, 'contribute-tour-manufacturer'));
        findElement(tree, 'contribute-tour-back-manufacturer').props.onPress();
        tree = harness.settle();
        assert.ok(findElement(tree, 'contribute-tour-camera-details'));
        assert.equal(
            findElement(tree, 'contribute-tour-spotlight').props.y,
            114,
        );
    });

    test('Try it closes the camera walkthrough and restores the form for real input', () => {
        const harness = createOverlayHarness();
        let tree;
        for (const step of CONTRIBUTE_TOUR_PHASE_STEPS.camera) {
            tree = harness.settle();
            findElement(
                tree,
                `contribute-tour-dismiss-${step}`,
            ).props.onPress();
        }
        assert.equal(harness.render(), null);
        assert.deepEqual(harness.scrolls.at(-1), { y: 0, animated: false });
        assert.equal(harness.tour.progress.status, 'active');
    });

    test('Skip tour leaves real draft data untouched and ends the overlay', () => {
        const pins = [{ id: 'camera-1' }];
        const changeset = { comment: 'Verified camera' };
        const harness = createOverlayHarness();
        const tree = harness.settle();
        findElement(
            tree,
            'contribute-tour-skip-camera-details',
        ).props.onPress();
        assert.equal(harness.render(), null);
        assert.deepEqual(pins, [{ id: 'camera-1' }]);
        assert.equal(changeset.comment, 'Verified camera');
    });

    test('review instructions never invoke Publish', () => {
        const harness = createOverlayHarness('review');
        let tree = harness.settle();
        findElement(tree, 'contribute-tour-dismiss-review').props.onPress();
        tree = harness.settle();
        assert.ok(findElement(tree, 'contribute-tour-publish'));
        findElement(tree, 'contribute-tour-dismiss-publish').props.onPress();
        assert.equal(harness.render(), null);
        assert.equal(harness.tour.progress.status, 'active');
    });
});

describe('spotlight positioning', () => {
    const viewport = { width: 390, height: 844 };
    const insets = { top: 44, bottom: 34, left: 0, right: 0 };
    test('places the tooltip below upper controls and above bottom controls', () => {
        const upper = getContributeTourLayout({
            viewport,
            insets,
            target: { x: 10, y: 90, width: 48, height: 48 },
        });
        const lower = getContributeTourLayout({
            viewport,
            insets,
            target: { x: 24, y: 745, width: 342, height: 56 },
        });
        assert.equal(upper.placement, 'below');
        assert.ok(upper.tooltip.y > upper.highlight.y + upper.highlight.height);
        assert.equal(lower.placement, 'above');
        assert.ok(lower.tooltip.y + 230 < lower.highlight.y);
        assert.ok(upper.tooltip.x >= 16);
        assert.ok(lower.tooltip.x + lower.tooltip.width <= viewport.width - 16);
    });
    test('uses a scrollable floating tooltip for large targets in landscape', () => {
        const layout = getContributeTourLayout({
            viewport: { width: 844, height: 390 },
            insets: { top: 0, bottom: 21, left: 44, right: 44 },
            target: { x: 60, y: 25, width: 300, height: 340 },
        });
        assert.equal(layout.placement, 'floating');
        assert.ok(layout.tooltip.maxHeight >= 120);
        assert.ok(
            layout.tooltip.y + Math.min(230, layout.tooltip.maxHeight) <= 369,
        );
    });
    test('accounts for the overlay window origin and does not spotlight off-screen controls', () => {
        const layout = getContributeTourLayout({
            viewport,
            insets,
            origin: { x: 0, y: 24 },
            target: { x: 20, y: 124, width: 48, height: 48 },
        });
        assert.equal(layout.highlight.y, 94);
        assert.equal(
            getContributeTourLayout({
                viewport,
                insets,
                target: { x: 400, y: 120, width: 48, height: 48 },
            }),
            null,
        );
    });
});

describe('contribution screen integration', () => {
    test('passes screen-owned tour state and targets across the bottom-sheet portal boundary', () => {
        const harness = createScreenHarness();
        const { ContributeStartSheet } = harness.screen(
            'contribute-start-sheet.js',
        );
        const { ContributePlacementSheet } = harness.screen(
            'contribute-placement-sheet.js',
        );
        const options = {
            insets: { top: 20, bottom: 10, left: 0, right: 0 },
            mapPreferencesAreLoaded: true,
            screenIsFocused: true,
            tourTargets: { current: {} },
        };
        const startProps = getTourOverlays(ContributeStartSheet(options))[0];
        const placedProps = getTourOverlays(
            ContributePlacementSheet(options),
        )[0];
        assert.equal(startProps.phase, 'start');
        assert.equal(startProps.tour, harness.contribution.tour);
        assert.ok(startProps.targets.current);
        assert.equal(placedProps.phase, 'placed');
        assert.equal(placedProps.tour, harness.contribution.tour);
        assert.equal(placedProps.targets, options.tourTargets);
        harness.setFocused(false);
        assert.equal(
            getTourOverlays(ContributeStartSheet(options))[0].enabled,
            false,
        );
        harness.contribution.contributeStatus = 'idle';
        harness.contribution.contributePlacementIsActive = false;
        assert.equal(
            getTourOverlays(ContributePlacementSheet(options))[0].enabled,
            false,
        );
    });

    test('shows first-use guidance when signed out and pauses it during sign-in', () => {
        const harness = createScreenHarness();
        const { ContributeStartSheet } = harness.screen(
            'contribute-start-sheet.js',
        );
        const render = () =>
            ContributeStartSheet({
                insets: { bottom: 10 },
                mapPreferencesAreLoaded: true,
            });
        harness.auth.isAuthenticated = false;

        assert.equal(getTourOverlays(render())[0].phase, 'start');
        assert.ok(findElement(render(), 'contribute-sign-in-button'));
        harness.auth.isSigningIn = true;
        assert.equal(getTourOverlays(render())[0].enabled, false);
        harness.auth.isSigningIn = false;
        harness.auth.isLoading = true;
        assert.equal(getTourOverlays(render())[0].enabled, false);
    });

    test('the normal Start editing action begins real placement', () => {
        const harness = createScreenHarness();
        const { ContributeStartSheet } = harness.screen(
            'contribute-start-sheet.js',
        );
        const tree = ContributeStartSheet({
            insets: { bottom: 10 },
            mapPreferencesAreLoaded: true,
        });
        findElement(tree, 'contribute-start-editing-button').props.onPress();

        assert.equal(harness.contribution.contributeStatus, 'placing');
        assert.deepEqual(harness.dismissals, ['start']);
    });

    test('placement guidance follows actual pins and the existing Next action', () => {
        const harness = createScreenHarness();
        const { ContributePlacementSheet } = harness.screen(
            'contribute-placement-sheet.js',
        );
        const render = () =>
            ContributePlacementSheet({
                insets: { bottom: 10 },
                mapPreferencesAreLoaded: true,
                screenIsFocused: true,
            });
        const pins = harness.contribution.pins;
        harness.contribution.pins = [];
        assert.equal(getTourOverlays(render())[0].enabled, false);
        assert.equal(
            findElement(render(), 'contribute-next-details-button').props
                .disabled,
            true,
        );
        harness.contribution.pins = pins;
        assert.equal(getTourOverlays(render())[0].enabled, true);
        findElement(render(), 'contribute-next-details-button').props.onPress();

        assert.deepEqual(harness.routes, ['/contribute/camera/0']);
        assert.deepEqual(harness.dismissals, [
            'placement-map',
            'placement',
            'placed',
        ]);
    });

    test('teaches camera details and directions once while retaining per-camera navigation', () => {
        const harness = createScreenHarness();
        const { default: CameraDetailsScreen } = harness.screen(
            'camera-details-screen.js',
        );
        assert.ok(
            getTourOverlays(CameraDetailsScreen()).every(
                (card) =>
                    card.enabled && card.tour === harness.contribution.tour,
            ),
        );
        findElement(
            CameraDetailsScreen(),
            'contribute-next-changeset-button',
        ).props.onPress();

        assert.deepEqual(harness.routes, ['/contribute/camera/1']);
        assert.deepEqual(
            harness.dismissals,
            CONTRIBUTE_TOUR_PHASE_STEPS.camera,
        );
        harness.params.index = '1';
        assert.ok(
            getTourOverlays(CameraDetailsScreen()).every(
                (card) => !card.enabled,
            ),
        );
        findElement(
            CameraDetailsScreen(),
            'contribute-next-changeset-button',
        ).props.onPress();
        assert.equal(harness.routes.at(-1), '/contribute/changeset');
    });

    test('requires the real comment before proceeding to review', () => {
        const harness = createScreenHarness();
        const { default: ChangesetDetailsScreen } = harness.screen(
            'changeset-details-screen.js',
        );
        assert.equal(
            getTourOverlays(ChangesetDetailsScreen())[0].phase,
            'changeset',
        );
        assert.equal(
            getTourOverlays(ChangesetDetailsScreen())[0].tour,
            harness.contribution.tour,
        );
        assert.equal(
            findElement(
                ChangesetDetailsScreen(),
                'contribute-next-review-button',
            ).props.disabled,
            true,
        );
        harness.contribution.changeset.comment = 'Added verified cameras';
        const button = findElement(
            ChangesetDetailsScreen(),
            'contribute-next-review-button',
        );
        assert.equal(button.props.disabled, false);
        button.props.onPress();

        assert.deepEqual(harness.routes, ['/contribute/review']);
        assert.deepEqual(harness.dismissals, ['changeset', 'source']);
    });

    test('renders review guidance without publishing and hides it while publishing', () => {
        const harness = createScreenHarness();
        const { default: ReviewPublishScreen } =
            harness.screen('review-screen.js');
        let tree = ReviewPublishScreen();
        assert.equal(getTourOverlays(tree)[0].enabled, true);
        assert.equal(getTourOverlays(tree)[0].tour, harness.contribution.tour);
        assert.equal(harness.publishCalls(), 0);
        findElement(tree, 'contribute-publish-button').props.onPress();
        assert.equal(harness.publishCalls(), 1);
        harness.contribution.publishStatus = 'publishing';
        tree = ReviewPublishScreen();
        assert.equal(getTourOverlays(tree)[0].enabled, false);
        assert.equal(
            findElement(tree, 'contribute-publish-button').props.loading,
            true,
        );
        assert.equal(
            findElement(tree, 'contribute-save-draft-button').props.disabled,
            true,
        );
    });

    test('passes tour state into the published screen overlay', () => {
        const harness = createScreenHarness();
        harness.contribution.publishResult = { changesetId: 123, nodes: [] };
        const { default: PublishedScreen } = harness.screen(
            'published-screen.js',
        );
        const props = getTourOverlays(PublishedScreen())[0];
        assert.equal(props.phase, 'published');
        assert.equal(props.tour, harness.contribution.tour);
        assert.equal(props.enabled, true);
        harness.setFocused(false);
        assert.equal(getTourOverlays(PublishedScreen())[0].enabled, false);
    });
});
