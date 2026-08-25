import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const acceptedDeviceLocationSource = readFileSync(
    new URL('../accepted-device-location.js', import.meta.url),
    'utf8',
);
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function createAcceptedDeviceLocationHarness({
    getAutoDriveSimulationIsActive = () => false,
} = {}) {
    const module = { exports: {} };
    const transformedSource = transformSync(acceptedDeviceLocationSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        '../auto-play-drive-simulation': {
            getAutoDriveSimulationIsActive,
        },
    };
    const loadModule = new Function(
        'require',
        'module',
        'exports',
        transformedSource,
    );

    loadModule(
        (specifier) => {
            if (!(specifier in mockedModules)) {
                throw new Error(`Unexpected module request: ${specifier}`);
            }

            return mockedModules[specifier];
        },
        module,
        module.exports,
    );

    return module.exports;
}

describe('accepted raw device location stream', () => {
    test('publishes every accepted fix and stops after removal', () => {
        const {
            addAcceptedDeviceLocationListener,
            getLatestAcceptedDeviceLocation,
            publishAcceptedDeviceLocation,
        } = createAcceptedDeviceLocationHarness();
        const received = [];
        const firstLocation = {
            coords: { latitude: 41.88, longitude: -87.63 },
            timestamp: 1000,
        };
        const secondLocation = {
            coords: { latitude: 41.881, longitude: -87.631 },
            timestamp: 2000,
        };
        const subscription = addAcceptedDeviceLocationListener((location) => {
            received.push(location);
        });

        publishAcceptedDeviceLocation(firstLocation);
        subscription.remove();
        publishAcceptedDeviceLocation(secondLocation);

        assert.deepEqual(received, [firstLocation]);
        assert.equal(getLatestAcceptedDeviceLocation(), secondLocation);
    });

    test('settles asynchronous listeners for background task durability', async () => {
        const {
            addAcceptedDeviceLocationListener,
            publishAcceptedDeviceLocation,
        } = createAcceptedDeviceLocationHarness();
        let finishListener;
        let listenerFinished = false;
        const listenerSettlement = new Promise((resolve) => {
            finishListener = () => {
                listenerFinished = true;
                resolve();
            };
        });
        const subscription = addAcceptedDeviceLocationListener(
            () => listenerSettlement,
        );
        const publication = publishAcceptedDeviceLocation({
            coords: { latitude: 41.88, longitude: -87.63 },
            timestamp: 3000,
        });

        await Promise.resolve();
        assert.equal(listenerFinished, false);

        finishListener();
        await publication;

        assert.equal(listenerFinished, true);
        subscription.remove();
    });

    test('accepts only simulated fixes while Auto Drive owns the stream', () => {
        let autoDriveSimulationIsActive = true;
        const {
            addAcceptedDeviceLocationListener,
            getLatestAcceptedDeviceLocation,
            publishAcceptedDeviceLocation,
        } = createAcceptedDeviceLocationHarness({
            getAutoDriveSimulationIsActive: () => autoDriveSimulationIsActive,
        });
        const received = [];
        const simulatedLocation = {
            coords: { latitude: 41.88, longitude: -87.63 },
            locationProvider: 'auto-drive-simulation',
            timestamp: 4500,
        };
        const subscription = addAcceptedDeviceLocationListener((location) => {
            received.push(location);
        });
        const realLocationDuringSimulation = {
            coords: { latitude: 40, longitude: -86 },
            locationProvider: 'expo-location-unmatched',
            timestamp: 4000,
        };
        const realLocationAfterSimulation = {
            coords: { latitude: 40.1, longitude: -86.1 },
            locationProvider: 'expo-location-unmatched',
            timestamp: 5000,
        };

        publishAcceptedDeviceLocation(realLocationDuringSimulation);
        publishAcceptedDeviceLocation(simulatedLocation);

        assert.deepEqual(received, [simulatedLocation]);
        assert.equal(getLatestAcceptedDeviceLocation(), simulatedLocation);

        autoDriveSimulationIsActive = false;
        publishAcceptedDeviceLocation(realLocationAfterSimulation);

        assert.deepEqual(received, [
            simulatedLocation,
            realLocationAfterSimulation,
        ]);
        assert.equal(
            getLatestAcceptedDeviceLocation(),
            realLocationAfterSimulation,
        );
        subscription.remove();
    });
});
