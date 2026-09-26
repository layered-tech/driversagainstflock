import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const packageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : new URL(
          '../../../node_modules/@iternio/react-native-auto-play/',
          import.meta.url,
      ).pathname;

function makeTimerContext() {
    const timers = new Map();
    let nextId = 100;
    const nativeTiming = {
        createTimer(callback, delay, repeats) {
            const id = nextId++;
            timers.set(id, { callback, delay, repeats });
            return id;
        },
        deleteTimer(id) {
            timers.delete(id);
        },
    };
    const source = readFileSync(
        resolve(packageRoot, 'src/utils/AutoPlayTimers.ts'),
        'utf8',
    );
    const code = stripTypeScriptTypes(source)
        .replace(/^import .*;$/m, '')
        .replace(
            'export function installAutoPlayTimers',
            'function installAutoPlayTimers',
        );
    const context = vm.createContext({
        HybridAutoPlayTiming: nativeTiming,
        performance: { now: () => 42 },
    });
    vm.runInContext(code, context);
    context.installAutoPlayTimers();
    return { context, timers };
}

test('native timers forward delays, repetition and callback arguments without RN timers', () => {
    const { context, timers } = makeTimerContext();
    const calls = [];
    const timeout = context.setTimeout(
        (...args) => calls.push(args),
        250,
        'eta',
        12,
    );
    const interval = context.setInterval(() => calls.push(['poll']), 1000);
    assert.equal(timers.get(timeout).delay, 250);
    assert.equal(timers.get(timeout).repeats, false);
    assert.equal(timers.get(interval).repeats, true);
    timers.get(timeout).callback();
    timers.get(interval).callback();
    assert.deepEqual(calls, [['eta', 12], ['poll']]);
    context.clearInterval(timeout);
    context.clearTimeout(interval);
    assert.equal(timers.size, 0);
    assert.doesNotThrow(() => context.clearTimeout(undefined));
});

test('animation frames use native timing and installation is idempotent', () => {
    const { context, timers } = makeTimerContext();
    let timestamp;
    const id = context.requestAnimationFrame((value) => {
        timestamp = value;
    });
    assert.equal(timers.get(id).delay, 0);
    assert.equal(timers.get(id).repeats, false);
    timers.get(id).callback();
    assert.equal(timestamp, 42);
    context.cancelAnimationFrame(id);
    assert.equal(timers.size, 0);
    const original = context.setTimeout;
    context.installAutoPlayTimers();
    assert.equal(context.setTimeout, original);
});

function makeNavigationContext(startNavigation) {
    const calls = [];
    const source = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    const start = source.indexOf('async function startAutoPlayNavigation(');
    const end = source.indexOf(
        'function handleRootHeaderPrimaryLocationPress(',
        start,
    );
    assert.ok(start >= 0 && end > start);
    const context = vm.createContext({
        loadAutoPlayModule: () => ({
            HybridAutoPlay: { popToRootTemplate: async () => {} },
        }),
        rootMapTemplate: {
            startNavigation,
            registerManeuvers: () => calls.push('maneuvers'),
        },
        rootMapTemplateIsReady: true,
        getSelectedDirectionsRouteOption: () => ({ routeKey: 'route' }),
        logAutoPlayPlatformAction() {},
        cancelAutoPlaySearchWork() {},
        clearAutoPlaySubmittedSearchResults() {},
        navigationRouteGeneration: 0,
        navigationLocationUpdateGeneration: 0,
        autoPlayArrivalDetector: { beginRoute() {} },
        activeNavigationRoute: null,
        activeNavigationDestination: null,
        hideAutoPlayRoutePreview() {},
        makeTripConfig: (route) => route,
        autoPlayHostNavigationIsActive: false,
        makeAutoPlayRegisteredManeuvers: () => [],
        setSharedRoutingState: () => calls.push('shared'),
        updateNavigationGuidance: () => calls.push('guidance'),
        autoDriveIsEnabled: false,
        startNavigationLocationUpdates: () => calls.push('location') && null,
        autoPlayNavigationRuntimeIsClusterOwned: false,
        setActiveAutoPlayNavigationState: () => calls.push('active'),
        cancelNativeAutoPlayNavigation: () => calls.push('cancel'),
        stopAutoPlayNavigation: async () => calls.push('stop'),
        showAutoPlayError: () => calls.push('error'),
    });
    vm.runInContext(source.slice(start, end), context);
    return { context, calls };
}

test('navigation waits for native startup before publishing guidance', async () => {
    let complete;
    const { context, calls } = makeNavigationContext(
        () =>
            new Promise((done) => {
                complete = done;
            }),
    );
    const pending = context.startAutoPlayNavigation({ destination: {} });
    assert.deepEqual(calls, []);
    complete();
    await pending;
    assert.deepEqual(calls, [
        'maneuvers',
        'shared',
        'guidance',
        'location',
        'active',
    ]);
});

test('rejected native startup rolls back without publishing navigation', async () => {
    const { context, calls } = makeNavigationContext(async () => {
        throw new Error('disconnected');
    });
    await context.startAutoPlayNavigation({ destination: {} });
    assert.deepEqual(calls, ['cancel', 'stop', 'error']);
});

test('a superseded native startup cannot resurrect guidance', async () => {
    let complete;
    const { context, calls } = makeNavigationContext(
        () =>
            new Promise((done) => {
                complete = done;
            }),
    );
    const pending = context.startAutoPlayNavigation({ destination: {} });
    context.navigationRouteGeneration += 1;
    complete();
    await pending;
    assert.deepEqual(calls, []);
});

test('the fork retains Android alert rejection cleanup without a local package patch', () => {
    const source = readFileSync(
        resolve(
            packageRoot,
            'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/MapTemplate.kt',
        ),
        'utf8',
    );
    assert.match(
        source,
        /AlertCallback\.REASON_NOT_SUPPORTED -> \{\s*alertConfig\.onDidDismiss\?\.let \{ it\(AlertDismissalReason\.SYSTEM\) \}/,
    );
    assert.match(
        source,
        /try \{\s*context\.getCarService\(AppManager::class\.java\)\.showAlert\(alert\)\s*alertConfig\.onWillShow/,
    );
    assert.match(
        source,
        /catch \(error: Exception\) \{\s*alertIds\.remove\(alert\.id\)[\s\S]*?alertConfig\.onDidDismiss\?\.let \{ it\(AlertDismissalReason\.SYSTEM\) \}/,
    );
});
