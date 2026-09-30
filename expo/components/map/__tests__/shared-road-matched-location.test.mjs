import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function createHarness({ simulationIsActive = false } = {}) {
    const modules = new Map();
    function load(url) {
        if (modules.has(url.href)) return modules.get(url.href).exports;
        const module = { exports: {} };
        modules.set(url.href, module);
        const { code } = transformSync(readFileSync(url, 'utf8'), {
            babelrc: false,
            configFile: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        });
        new Function('require', 'module', 'exports', code)(
            (specifier) => {
                if (specifier === '../auto-play-drive-simulation') {
                    return {
                        getAutoDriveSimulationIsActive: () =>
                            simulationIsActive,
                    };
                }
                if (specifier === './constants')
                    return { MINIMUM_DRIVING_COURSE_SPEED_MPS: 1.5 };
                return load(
                    new URL(
                        specifier.endsWith('.js')
                            ? specifier
                            : `${specifier}.js`,
                        url,
                    ),
                );
            },
            module,
            module.exports,
        );
        return module.exports;
    }
    return {
        ...load(new URL('../shared-road-matched-location.js', import.meta.url)),
        ...load(new URL('../shared-map-preferences-sync.js', import.meta.url)),
    };
}

test('the retained real GPS session cannot overwrite an auto-drive simulation', () => {
    const harness = createHarness({ simulationIsActive: true });
    const simulated = { latitude: 42, longitude: -88, recordedAt: 1000 };
    harness.setSharedMapUserLocation(simulated);
    harness.publishSharedRoadMatchedLocation(position(2000));
    assert.equal(harness.getSharedMapUserLocation(), simulated);
});

function position(timestamp, speed = 10, heading = 90) {
    return {
        coords: { latitude: 41, longitude: -87, accuracy: 4, speed, heading },
        timestamp,
        roadMatch: {
            isOffRoad: false,
            roadContext: { primaryText: 'Main Street' },
            speedLimit: { speedLimitMph: 35 },
        },
    };
}

test('car-owned publication supplies a secondary display with position, motion, road and limit', () => {
    const harness = createHarness();
    const observed = [];
    harness.addSharedMapPreferencesStateListener(() =>
        observed.push(harness.getSharedMapUserLocation()),
    );
    harness.publishSharedRoadMatchedLocation(position(1000));
    assert.equal(observed.length, 1);
    assert.deepEqual(observed[0], {
        accuracy: 4,
        latitude: 41,
        longitude: -87,
        recordedAt: 1000,
        speed: 10,
        heading: 90,
        courseHeading: 90,
        isMoving: true,
        locationProvider: 'in-house-road-matcher',
        roadMatch: position(1000).roadMatch,
    });
    harness.publishSharedRoadMatchedLocation(position(2000, 0, 270));
    assert.equal(harness.getSharedMapUserLocation().heading, 90);
    assert.equal(harness.getSharedMapUserLocation().isMoving, false);
    harness.publishSharedRoadMatchedLocation(position(1500, 10, 180));
    assert.equal(observed.length, 2);
    assert.equal(harness.getSharedMapUserLocation().recordedAt, 2000);
});

test('same-fix road enrichment updates secondary displays and off-road fixes clear road metadata', () => {
    const harness = createHarness();
    const offRoad = {
        ...position(1000),
        roadMatch: { isOffRoad: true, roadContext: null, speedLimit: null },
    };
    harness.publishSharedRoadMatchedLocation(offRoad);
    harness.publishSharedRoadMatchedLocation(position(1000));
    assert.equal(
        harness.getSharedMapUserLocation().roadMatch.speedLimit.speedLimitMph,
        35,
    );
    harness.publishSharedRoadMatchedLocation({ ...offRoad, timestamp: 2000 });
    assert.equal(harness.getSharedMapUserLocation().roadMatch.speedLimit, null);
});
