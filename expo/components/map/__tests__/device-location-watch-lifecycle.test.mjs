import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { getLocationWatchOptions } from '../location-watch-options.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const transformedSource = transformSync(
    readFileSync(new URL('../use-device-location.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    },
).code;

function createWatchHarness({ watchHeadingAsync, watchPositionAsync } = {}) {
    let activeHooks = [];
    const publishedLocations = [];
    const headingWatches = [];
    const positionWatches = [];
    let headingNormalizationCount = 0;
    let hookIndex = 0;
    let pendingEffects = [];
    const module = { exports: {} };
    const mockedModules = {
        react: {
            useRef(value) {
                const index = hookIndex++;

                activeHooks[index] ??= { current: value };

                return activeHooks[index];
            },
            useEffect(effect, dependencies) {
                const index = hookIndex++;
                const previous = activeHooks[index];
                const unchanged = previous?.dependencies.every((value, i) =>
                    Object.is(value, dependencies[i]),
                );

                if (!unchanged) {
                    pendingEffects.push(() => {
                        previous?.cleanup?.();
                        activeHooks[index] = {
                            cleanup: effect(),
                            dependencies,
                        };
                    });
                }
            },
        },
        'expo-location': {
            Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
            watchPositionAsync:
                watchPositionAsync ??
                (async (options, callback) => {
                    const watch = { callback, options, removalCount: 0 };

                    positionWatches.push(watch);

                    return { remove: () => watch.removalCount++ };
                }),
            watchHeadingAsync:
                watchHeadingAsync ??
                (async (callback) => {
                    const watch = { callback, removalCount: 0 };

                    headingWatches.push(watch);

                    return { remove: () => watch.removalCount++ };
                }),
        },
        './accepted-device-location': {
            publishAcceptedDeviceLocation: (location) =>
                publishedLocations.push(location),
        },
        './geo': {
            getLocationCompassHeading(heading) {
                headingNormalizationCount += 1;

                return heading.trueHeading;
            },
        },
        './location-watch-options': { getLocationWatchOptions },
        './road-matching-session': {},
    };

    new Function('require', 'module', 'exports', transformedSource)(
        (specifier) => {
            assert.ok(specifier in mockedModules, specifier);

            return mockedModules[specifier];
        },
        module,
        module.exports,
    );

    function createSurface() {
        const hooks = [];

        return {
            async render(hookName, options) {
                activeHooks = hooks;
                hookIndex = 0;
                pendingEffects = [];
                module.exports[hookName](options);
                pendingEffects.forEach((effect) => effect());
                await Promise.resolve();
            },
            unmount() {
                hooks.forEach((hook) => hook.cleanup?.());
            },
        };
    }

    return {
        ...createSurface(),
        createSurface,
        get headingNormalizationCount() {
            return headingNormalizationCount;
        },
        headingWatches,
        positionWatches,
        publishedLocations,
    };
}

test('GPS updates use the latest callback without recreating the native watch', async () => {
    const harness = createWatchHarness();
    const received = [];
    const options = {
        handleUserLocationUpdate: (location) =>
            received.push(['old', location]),
        isDrivingMode: false,
        isMountedRef: { current: true },
        locationAccessGranted: true,
        setLocationError() {},
    };
    await harness.render('useLocationWatch', options);
    const firstLocation = { timestamp: 1000 };
    harness.positionWatches[0].callback(firstLocation);
    await harness.render('useLocationWatch', {
        ...options,
        handleUserLocationUpdate: (location) =>
            received.push(['new', location]),
    });
    const nextLocation = { timestamp: 2000 };
    harness.positionWatches[0].callback(nextLocation);

    assert.equal(harness.positionWatches.length, 1);
    assert.deepEqual(received, [
        ['old', firstLocation],
        ['new', nextLocation],
    ]);
    assert.deepEqual(harness.publishedLocations, [firstLocation, nextLocation]);
    harness.unmount();
    assert.equal(harness.positionWatches[0].removalCount, 1);
});

test('GPS accuracy changes still replace the native watch and reject old callbacks', async () => {
    const harness = createWatchHarness();
    const received = [];
    const options = {
        handleUserLocationUpdate: (location) => received.push(location),
        isDrivingMode: false,
        isMountedRef: { current: true },
        locationAccessGranted: true,
        setLocationError() {},
    };
    await harness.render('useLocationWatch', options);
    await harness.render('useLocationWatch', {
        ...options,
        isDrivingMode: true,
    });
    harness.positionWatches[0].callback({ timestamp: 1000 });
    harness.positionWatches[1].callback({ timestamp: 2000 });

    assert.equal(harness.positionWatches.length, 2);
    assert.equal(harness.positionWatches[0].removalCount, 1);
    assert.equal(harness.positionWatches[1].options.accuracy, 6);
    assert.deepEqual(received, [{ timestamp: 2000 }]);
    harness.unmount();
});

test('a removed GPS watch cannot report a late acquisition error', async () => {
    let rejectWatch;
    const errors = [];
    const harness = createWatchHarness({
        watchPositionAsync: () =>
            new Promise((resolve, reject) => {
                rejectWatch = reject;
            }),
    });
    await harness.render('useLocationWatch', {
        handleUserLocationUpdate() {},
        isDrivingMode: false,
        isMountedRef: { current: true },
        locationAccessGranted: true,
        setLocationError: (error) => errors.push(error),
    });
    harness.unmount();
    rejectWatch(new Error('Old watch failed'));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(errors, []);
});

test('heading updates use the latest callback without recreating the compass watch', async () => {
    const harness = createWatchHarness();
    const headings = [];
    const options = {
        handleHeadingUpdate: (heading) => headings.push(['old', heading]),
        isDrivingMode: true,
        locationAccessGranted: true,
    };
    await harness.render('useHeadingWatch', options);
    await harness.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate: (heading) => headings.push(['new', heading]),
    });
    harness.headingWatches[0].callback({ trueHeading: 90 });

    assert.equal(harness.headingWatches.length, 1);
    assert.deepEqual(headings, [['new', 90]]);
    await harness.render('useHeadingWatch', {
        ...options,
        isDrivingMode: false,
    });
    assert.equal(harness.headingWatches[0].removalCount, 1);
    harness.headingWatches[0].callback({ trueHeading: 180 });
    assert.deepEqual(headings, [['new', 90]]);
});

test('phone and car share one compass watch and normalize each heading once', async () => {
    const harness = createWatchHarness();
    const car = harness.createSurface();
    const phoneHeadings = [];
    const carHeadings = [];
    const options = { isDrivingMode: true, locationAccessGranted: true };
    await harness.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate: (heading) => phoneHeadings.push(heading),
    });
    await car.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate: (heading) => carHeadings.push(heading),
    });

    assert.equal(harness.headingWatches.length, 1);
    harness.headingWatches[0].callback({ trueHeading: 90 });
    assert.deepEqual(phoneHeadings, [90]);
    assert.deepEqual(carHeadings, [90]);
    assert.equal(harness.headingNormalizationCount, 1);
    harness.unmount();
    assert.equal(harness.headingWatches[0].removalCount, 0);
    harness.headingWatches[0].callback({ trueHeading: 180 });
    assert.deepEqual(phoneHeadings, [90]);
    assert.deepEqual(carHeadings, [90, 180]);
    car.unmount();
    assert.equal(harness.headingWatches[0].removalCount, 1);
    harness.headingWatches[0].callback({ trueHeading: 270 });
    assert.deepEqual(carHeadings, [90, 180]);
});

test('a failing compass consumer does not block the other surface', async () => {
    const harness = createWatchHarness();
    const car = harness.createSurface();
    const carHeadings = [];
    const options = { isDrivingMode: true, locationAccessGranted: true };
    await harness.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate() {
            throw new Error('Surface failed');
        },
    });
    await car.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate: (heading) => carHeadings.push(heading),
    });
    assert.doesNotThrow(() =>
        harness.headingWatches[0].callback({ trueHeading: 90 }),
    );
    assert.deepEqual(carHeadings, [90]);
    harness.unmount();
    car.unmount();
});

test('a new surface can retain a compass setup after its original surface leaves', async () => {
    let finishSetup;
    let nativeCallback;
    let watchCount = 0;
    let removalCount = 0;
    const harness = createWatchHarness({
        watchHeadingAsync: (callback) => {
            watchCount += 1;
            nativeCallback = callback;

            return new Promise((resolve) => {
                finishSetup = () => resolve({ remove: () => removalCount++ });
            });
        },
    });
    const car = harness.createSurface();
    const carHeadings = [];
    const options = { isDrivingMode: true, locationAccessGranted: true };
    await harness.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate() {},
    });
    harness.unmount();
    await car.render('useHeadingWatch', {
        ...options,
        handleHeadingUpdate: (heading) => carHeadings.push(heading),
    });
    assert.equal(watchCount, 1);
    finishSetup();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(removalCount, 0);
    nativeCallback({ trueHeading: 90 });
    assert.deepEqual(carHeadings, [90]);
    car.unmount();
    assert.equal(removalCount, 1);
});

test('a compass setup that resolves after the last surface leaves is removed', async () => {
    let finishSetup;
    let removalCount = 0;
    const harness = createWatchHarness({
        watchHeadingAsync: () =>
            new Promise((resolve) => {
                finishSetup = () => resolve({ remove: () => removalCount++ });
            }),
    });
    await harness.render('useHeadingWatch', {
        isDrivingMode: true,
        locationAccessGranted: true,
        handleHeadingUpdate() {},
    });
    harness.unmount();
    finishSetup();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(removalCount, 1);
});

test('a retired native compass cannot deliver into a replacement watch', async () => {
    const harness = createWatchHarness();
    const replacement = harness.createSurface();
    const headings = [];
    const options = {
        isDrivingMode: true,
        locationAccessGranted: true,
        handleHeadingUpdate: (heading) => headings.push(heading),
    };
    await harness.render('useHeadingWatch', options);
    harness.unmount();
    await replacement.render('useHeadingWatch', options);

    assert.equal(harness.headingWatches.length, 2);
    harness.headingWatches[0].callback({ trueHeading: 90 });
    harness.headingWatches[1].callback({ trueHeading: 180 });
    assert.deepEqual(headings, [180]);
    replacement.unmount();
});
