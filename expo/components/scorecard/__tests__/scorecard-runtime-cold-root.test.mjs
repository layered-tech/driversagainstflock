import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const scorecardRuntimeInstancePath = fileURLToPath(
    new URL('../scorecard-runtime-instance.js', import.meta.url),
);

function loadCommonJsModule(filePath, mocks, cache = new Map()) {
    if (mocks.has(filePath)) {
        return mocks.get(filePath);
    }

    if (cache.has(filePath)) {
        return cache.get(filePath).exports;
    }

    const module = { exports: {} };
    const transformedSource = transformSync(readFileSync(filePath, 'utf8'), {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;

    cache.set(filePath, module);

    function loadDependency(specifier) {
        if (!specifier.startsWith('.')) {
            return require(specifier);
        }

        const unresolvedPath = resolve(dirname(filePath), specifier);
        const dependencyPath = extname(unresolvedPath)
            ? unresolvedPath
            : unresolvedPath + '.js';

        return loadCommonJsModule(dependencyPath, mocks, cache);
    }

    new Function('require', 'module', 'exports', transformedSource)(
        loadDependency,
        module,
        module.exports,
    );

    return module.exports;
}

function makeLocation(longitude, latitude, timestamp) {
    return {
        coords: {
            accuracy: 5,
            heading: 0,
            latitude,
            longitude,
            speed: 0.5,
        },
        timestamp,
    };
}

function createColdAutomotiveRootHarness() {
    const scorecardDirectory = dirname(scorecardRuntimeInstancePath);
    const acceptedLocationListeners = new Set();
    const autoPlayListeners = new Set();
    const cameraListeners = new Set();
    const routingListeners = new Set();
    const encryptedWrites = [];
    let autoPlayState = {
        isConnected: false,
        isVisible: false,
        renderState: 'didDisappear',
    };
    let cameraNodes = [];
    let routingState = {
        directionsRoute: null,
        drivingModeIsActive: false,
    };
    let latestAcceptedLocation = null;
    const mocks = new Map();

    function setMock(relativePath, exports) {
        mocks.set(resolve(scorecardDirectory, relativePath), exports);
    }

    setMock('../auto-play-session-state.js', {
        addAutoPlaySessionStateListener(listener) {
            autoPlayListeners.add(listener);
            listener(autoPlayState);

            return () => autoPlayListeners.delete(listener);
        },
        getAutoPlaySessionState() {
            return autoPlayState;
        },
    });
    setMock('../map/accepted-device-location.js', {
        addAcceptedDeviceLocationListener(listener) {
            acceptedLocationListeners.add(listener);

            return {
                remove() {
                    acceptedLocationListeners.delete(listener);
                },
            };
        },
        getLatestAcceptedDeviceLocation() {
            return latestAcceptedLocation;
        },
    });
    setMock('../map/config.js', {
        APP_ENVIRONMENT: 'production',
    });
    setMock('../map/directions.js', {
        getDirectionsRouteProgress: () => null,
        getDirectionsWaypointCoordinate: () => null,
        getSelectedDirectionsRouteOption: () => null,
    });
    setMock('../map/driving-motion-state.js', {
        getDrivingMotionState({ nextLocation }) {
            return {
                isMoving: Number(nextLocation?.coords?.speed) >= 1.5,
            };
        },
    });
    setMock('../map/electronic-horizon-alpr-store.js', {
        addElectronicHorizonAlprNodesListener(listener) {
            cameraListeners.add(listener);

            return {
                remove() {
                    cameraListeners.delete(listener);
                },
            };
        },
        getSharedElectronicHorizonAlprNodes() {
            return cameraNodes;
        },
        async hydrateElectronicHorizonAlprNodes() {
            return cameraNodes;
        },
    });
    setMock('../map/geo.js', {
        getLocationCourseHeading(location) {
            return location?.coords?.heading ?? null;
        },
        getLocationUpdate(location) {
            return location;
        },
    });
    setMock('../map/shared-routing-state.js', {
        addSharedRoutingStateListener(listener) {
            routingListeners.add(listener);
            listener(routingState);

            return () => routingListeners.delete(listener);
        },
        getDirectionsRouteGeometrySyncKey: () => '',
        getSharedRoutingState() {
            return routingState;
        },
        async hydrateSharedRoutingStateAsync() {
            return routingState;
        },
        setSharedRoutingState(nextState) {
            routingState = nextState;
            routingListeners.forEach((listener) => listener(routingState));
        },
    });
    setMock('./local-state-resolver.js', {
        getLocalStartingStateCode: () => null,
    });
    setMock('./scorecard-storage.js', {
        async deleteEncryptedScorecardState() {},
        async loadEncryptedScorecardState() {
            return null;
        },
        async saveEncryptedScorecardState(state, savedAt) {
            encryptedWrites.push({ savedAt, state });

            return true;
        },
        scorecardSecureStorageIsAvailable: () => true,
    });

    const runtimeInstance = loadCommonJsModule(
        scorecardRuntimeInstancePath,
        mocks,
    );

    return {
        acceptedLocationListeners,
        autoPlayListeners,
        cameraListeners,
        encryptedWrites,
        publishAutoPlayState(nextState) {
            autoPlayState = { ...autoPlayState, ...nextState };
            autoPlayListeners.forEach((listener) => listener(autoPlayState));
        },
        publishCameraNodes(nodes) {
            cameraNodes = nodes;
            cameraListeners.forEach((listener) => listener(cameraNodes));
        },
        publishLocation(location) {
            latestAcceptedLocation = location;

            return Promise.allSettled(
                [...acceptedLocationListeners].map((listener) =>
                    listener(location),
                ),
            );
        },
        routingListeners,
        runtimeInstance,
    };
}

describe('cold automotive scorecard root', () => {
    test('writes one encrypted state without mounting a Router provider', async () => {
        const harness = createColdAutomotiveRootHarness();

        await harness.runtimeInstance.initializeScorecardRuntime();
        await harness.runtimeInstance.initializeScorecardRuntime();

        assert.equal(harness.acceptedLocationListeners.size, 1);
        assert.equal(harness.autoPlayListeners.size, 1);
        assert.equal(harness.cameraListeners.size, 1);
        assert.equal(harness.routingListeners.size, 1);

        harness.publishCameraNodes([
            {
                coordinate: [0, 0],
                direction: '0',
                osmId: 101,
            },
        ]);
        harness.publishAutoPlayState({
            isConnected: true,
            isVisible: false,
            renderState: 'didDisappear',
        });
        const firstFixAt = Date.now();

        await harness.publishLocation(makeLocation(0, -0.0001, firstFixAt));
        await harness.publishLocation(
            makeLocation(0, 0.0002, firstFixAt + 1_000),
        );

        assert.equal(harness.encryptedWrites.length, 1);
        assert.equal(
            harness.encryptedWrites[0].state.activeSession?.mode,
            'free',
        );
        assert.equal(harness.encryptedWrites[0].state.exposures.length, 1);
        assert.equal(
            harness.encryptedWrites[0].state.exposures[0].osmId,
            '101',
        );
    });
});
