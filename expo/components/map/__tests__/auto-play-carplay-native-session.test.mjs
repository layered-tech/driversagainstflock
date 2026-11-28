import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );
const autoPlayAppSource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function readAutoPlaySource(path) {
    return readFileSync(join(autoPlayPackageRoot, path), 'utf8');
}

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.notEqual(start, -1, `Missing source token: ${startToken}`);
    assert.notEqual(end, -1, `Missing source token: ${endToken}`);

    return source.slice(start, end);
}

test('a delayed native connect replay installs one root and a late disconnect leaves the new session usable', async () => {
    let nativeSession = 1;
    const listeners = {};
    const roots = [];
    const disconnections = [];
    const noop = () => {};
    const native = {
        isConnected: () => nativeSession != null,
        getCurrentSessionId: () => nativeSession,
        addListener(event, listener) {
            listeners[event] = listener;
        },
    };
    const registration = autoPlayAppSource
        .slice(
            autoPlayAppSource.indexOf(
                'export default function registerAutoPlay()',
            ),
        )
        .replace('export default ', '');
    vm.runInNewContext(registration + '\nregisterAutoPlay();', {
        autoPlayRegistered: false,
        autoPlayPlatform: { registerPlatformListeners: noop },
        loadAutoPlayModule: () => ({ HybridAutoPlay: native }),
        handleAutoPlayConnect: async () => roots.push(nativeSession),
        handleAutoPlayDisconnect: () => disconnections.push('disconnect'),
        primaryLocationsUnsubscribe: null,
        sharedRoutingStateUnsubscribe: null,
        addPrimaryLocationsListener: noop,
        addSharedRoutingStateListener: noop,
        setAutoPlayMapButtonAppearanceListener: noop,
        updateRootMapButtonAppearance: noop,
        handlePrimaryLocationsChanged: noop,
        refreshAutoPlayPrimaryLocations: noop,
        syncAutoPlayNavigationFromSharedRoutingState: noop,
        makeButtonGlyphImage: noop,
        handleAutoPlayDashboardAction: noop,
        handleAutoPlaySessionRenderState: noop,
        handleVoiceNavigationWhenReady: noop,
    });

    // A retained Fabric root needs its component registered during bundle
    // evaluation. Nitro can deliver the already-connected replay afterwards.
    assert.deepEqual(roots, [1]);
    await Promise.resolve();
    listeners.didConnect(1);
    assert.deepEqual(roots, [1]);

    nativeSession = 2;
    listeners.didConnect(2);
    const disconnectCount = disconnections.length;
    listeners.didDisconnect(1);
    listeners.didConnect(1);
    assert.deepEqual(roots, [1, 2]);
    assert.equal(disconnections.length, disconnectCount);

    nativeSession = undefined;
    listeners.didDisconnect(2);
    listeners.didDisconnect(2);
    assert.equal(disconnections.length, disconnectCount + 1);
});

function startRootPresentation() {
    let nativeSession = 3;
    let route = 'original';
    let finishPresentation;
    let failPresentation;
    let onDidAppear;
    const receivedRoutes = [];
    const templates = [];
    const timers = [];
    const noop = () => {};
    const context = vm.createContext({
        autoPlayConnectionGeneration: 0,
        DEFAULT_AUTO_PLAY_STATE: {},
        loadAutoPlayModule: () => ({
            HybridAutoPlay: { getCurrentSessionId: () => nativeSession },
            MapTemplate: class {
                constructor(config) {
                    onDidAppear = config.onDidAppear;
                }
                setRootTemplate() {
                    templates.push(this);
                    return new Promise((resolve, reject) => {
                        finishPresentation = resolve;
                        failPresentation = reject;
                    });
                }
            },
        }),
        hydrateSharedRoutingStateAsync: async () => {},
        setAutoPlaySessionConnected: noop,
        retainAutoPlayConnectionRoadMatchingSession: noop,
        setAutoPlayState: noop,
        getRootMapHeaderActions: noop,
        getRootMapButtons: noop,
        getTemplateChromeKey: noop,
        getAutoPlayMapGestureCallbacks: noop,
        autoPlayPlatform: {
            serializesRootTemplatePresentation: true,
            getMapTemplatePlatformConfig: noop,
        },
        handleAutoDriveEnabled: noop,
        updateRootTemplateHeaderActions: noop,
        syncAutoPlayNavigationFromSharedRoutingState: () =>
            receivedRoutes.push(route),
        replayPendingVoiceNavigation: noop,
        replayPendingDashboardAction: noop,
        logAutoPlayPlatformAction: noop,
        setTimeout: (fn) => timers.push(fn),
    });
    vm.runInContext(
        sourceBetween(
            autoPlayAppSource,
            'function withTimeout(',
            'async function getLocationPermissionIsGranted(',
        ) +
            sourceBetween(
                autoPlayAppSource,
                'const ROOT_TEMPLATE_SETUP_TIMEOUT_MS',
                'function clearAutoPlayNavigationRuntime(',
            ),
        context,
    );
    const setup = context.handleAutoPlayConnect(nativeSession);
    return {
        setup,
        context,
        templates,
        receivedRoutes,
        changeRoute: () => {
            route = 'latest';
        },
        reconnect: () => {
            nativeSession++;
        },
        appear: () => onDidAppear(true),
        finish: () => finishPresentation(),
        fail: () =>
            failPresentation(new Error('CarPlay rejected presentation')),
        async tick() {
            timers.splice(0).forEach((timer) => timer());
            await new Promise(setImmediate);
        },
    };
}

test('a slow CarPlay root presentation accepts the latest phone route without replacing the map', async () => {
    const car = startRootPresentation();
    await car.tick();
    await car.tick();
    assert.equal(car.templates.length, 1);
    car.changeRoute();
    car.appear();
    await car.setup;
    assert.equal(car.context.rootMapTemplateIsReady, true);
    car.finish();
    await car.tick();
    assert.deepEqual(car.receivedRoutes, ['latest']);
    assert.equal(car.templates.length, 1);
});

test('CarPlay retries a rejected presentation and syncs a route when it succeeds offscreen', async () => {
    const car = startRootPresentation();
    car.fail();
    await car.tick();
    await car.tick();
    assert.equal(car.templates.length, 2);
    car.finish();
    await car.setup;
    assert.deepEqual(car.receivedRoutes, ['original']);
});

test('presentation from a replaced CarPlay session cannot activate navigation', async () => {
    const car = startRootPresentation();
    car.reconnect();
    car.finish();
    await car.setup;
    assert.equal(car.context.rootMapTemplateIsReady, false);
    assert.deepEqual(car.receivedRoutes, []);
});

const hybridMapTemplateSource = readAutoPlaySource(
    'ios/hybrid/HybridMapTemplate.swift',
);
const mapTemplateSource = readAutoPlaySource('ios/templates/MapTemplate.swift');

const mapTemplateWrapperSource = readAutoPlaySource(
    'src/templates/MapTemplate.ts',
);

test('CarPlay app stops through the upstream no-argument API', () => {
    assert.match(
        mapTemplateWrapperSource,
        /stopNavigation\(\)[\s\S]*?HybridMapTemplate\.stopNavigation\(this\.id\)/,
    );
    assert.match(
        hybridMapTemplateSource,
        /func stopNavigation\(templateId: String\)[\s\S]*?template\.stopNavigation\(\)/,
    );
    assert.match(
        mapTemplateSource,
        /func stopNavigation\(\)[\s\S]*?finishNavigationSession\(\)/,
    );

    assert.match(
        mapTemplateSource,
        /private func finishNavigationSession\(\)[\s\S]*?navigationSession\.finishTrip\(\)/,
    );

    assert.match(
        autoPlayAppSource,
        /if \(notifyTemplate && rootMapTemplate\)[\s\S]*?rootMapTemplate\.stopNavigation\(\)/,
    );
    assert.equal(autoPlayAppSource.match(/statusLabel: 'Arrived'/g)?.length, 2);
});

test('navigation setup failures stop any native session that may have started', () => {
    const cancelNativeNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function stopNativeAutoPlayNavigation(',
        'async function stopAutoPlayNavigation(',
    );
    const startNavigationSource = sourceBetween(
        autoPlayAppSource,
        'function startAutoPlayNavigation(',
        'function handleRootHeaderPrimaryLocationPress(',
    );

    assert.match(
        cancelNativeNavigationSource,
        /mapTemplate\.stopNavigation\(\)/,
    );
    assert.match(
        startNavigationSource,
        /let nativeNavigationMayBeActive = hostNavigationAlreadyStarted/,
    );
    assert.match(
        startNavigationSource,
        /const tripConfig = makeTripConfig\(route\);\s*nativeNavigationMayBeActive = true;\s*await rootMapTemplate\.startNavigation\(tripConfig\)/,
    );
    assert.match(
        startNavigationSource,
        /const rollbackNavigationStart =[\s\S]*?if \(nativeNavigationMayBeActive\) \{\s*stopNativeAutoPlayNavigation\(rootMapTemplate\);\s*\}[\s\S]*?catch \(error\) \{\s*rollbackNavigationStart\(error\);\s*\}/,
    );
    assert.match(
        startNavigationSource,
        /stopAutoPlayNavigation\(\{\s*notifyTemplate: false,\s*publishSharedState,\s*\}\)[\s\S]*?showAutoPlayError/,
    );
});
