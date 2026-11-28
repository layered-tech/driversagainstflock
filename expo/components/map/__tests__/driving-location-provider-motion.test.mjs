import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createLocationPuckProviderLifecycle } from '../location-puck-provider-lifecycle.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { code } = transformSync(
    readFileSync(
        new URL('../driving-location-provider.js', import.meta.url),
        'utf8',
    ),
    {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            require('@babel/plugin-transform-modules-commonjs'),
        ],
    },
);

function createProviderHarness(nativeSupported) {
    const slots = [];
    const nativeLocations = [];
    const clearedMaps = [];
    let index = 0;
    let effects = [];
    let needsRender = false;
    const customProvider = Symbol('CustomLocationProvider');

    function memoSlot(factory, dependencies) {
        const slotIndex = index++;
        const previous = slots[slotIndex];
        const changed =
            !previous ||
            dependencies.some(
                (value, i) => !Object.is(value, previous.dependencies[i]),
            );
        if (changed)
            slots[slotIndex] = { dependencies, value: factory(previous) };
        return slots[slotIndex].value;
    }

    const mocks = {
        react: {
            useRef: (initial) => (slots[index++] ??= { current: initial }),
            useMemo: memoSlot,
            useState(initial) {
                const slotIndex = index++;
                if (!(slotIndex in slots)) slots[slotIndex] = initial;
                return [
                    slots[slotIndex],
                    (value) => {
                        if (!Object.is(value, slots[slotIndex])) {
                            slots[slotIndex] = value;
                            needsRender = true;
                        }
                    },
                ];
            },
            useEffect(effect, dependencies) {
                memoSlot((previous) => {
                    const state = { cleanup: null };
                    effects.push(() => {
                        previous?.value.cleanup?.();
                        state.cleanup = effect();
                    });
                    return state;
                }, dependencies);
            },
        },
        'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
        '@rnmapbox/maps': { CustomLocationProvider: customProvider },
        './geo': {
            normalizeDirectionDegrees: (value) => ((value % 360) + 360) % 360,
            normalizeLongitude: (value) =>
                ((((value + 180) % 360) + 360) % 360) - 180,
        },
        './location-puck-3d': {
            isLocationPuckLocationProviderSupported: () => nativeSupported,
            setLocationPuckLocationAsync: async (map, location) => {
                nativeLocations.push(location);
                return true;
            },
            clearLocationPuckLocationProviderAsync: async (map) => {
                clearedMaps.push(map);
                return true;
            },
        },
        './location-puck-provider-lifecycle': {
            createLocationPuckProviderLifecycle,
        },
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (specifier) => {
            assert.ok(specifier in mocks, `Missing mock: ${specifier}`);
            return mocks[specifier];
        },
        module,
        module.exports,
    );

    return {
        nativeLocations,
        clearedMaps,
        async render(props) {
            let output;
            for (let pass = 0; pass < 8; pass++) {
                do {
                    needsRender = false;
                    index = 0;
                    effects = [];
                    output = module.exports.DrivingLocationProvider(props);
                    effects.forEach((effect) => effect());
                } while (needsRender);
                await Promise.resolve();
            }
            return output;
        },
        cleanup() {
            slots.forEach((slot) => slot?.value?.cleanup?.());
        },
    };
}

for (const nativeSupported of [true, false]) {
    test(`uses each location fix directly in the ${nativeSupported ? 'native' : 'fallback'} provider`, async (context) => {
        context.mock.timers.enable({
            apis: ['Date', 'setTimeout'],
            now: 10_000,
        });
        const harness = createProviderHarness(nativeSupported);
        context.after(() => harness.cleanup());
        const location = {
            courseHeading: 90,
            isMoving: true,
            latitude: 41.8781,
            longitude: -87.6298828125,
            recordedAt: 10_000,
            roadMatch: { isOffRoad: false },
            speed: 20,
        };
        let props = {
            attachmentKey: 'map',
            enabled: true,
            mapViewRef: { current: {} },
            userLocation: location,
        };
        let output = await harness.render(props);
        const getProviderLocation = () =>
            nativeSupported ? harness.nativeLocations.at(-1) : output.props;
        const assertProviderLocation = (fix) => {
            const providerLocation = getProviderLocation();
            assert.deepEqual(providerLocation.coordinate, [
                fix.longitude,
                fix.latitude,
            ]);
            assert.equal(providerLocation.heading, fix.courseHeading);
            if (nativeSupported) {
                assert.equal(providerLocation.recordedAt, fix.recordedAt);
            }
        };

        assertProviderLocation(location);
        const initialNativeUpdateCount = harness.nativeLocations.length;
        context.mock.timers.tick(900);
        output = await harness.render(props);
        assertProviderLocation(location);
        assert.equal(harness.nativeLocations.length, initialNativeUpdateCount);
        assert.equal(harness.clearedMaps.length, 0);

        const nextLocation = {
            ...location,
            courseHeading: 95,
            longitude: -87.629638671875,
            recordedAt: 10_900,
        };
        props = { ...props, userLocation: nextLocation };
        output = await harness.render(props);
        assertProviderLocation(nextLocation);

        context.mock.timers.tick(3000);
        output = await harness.render(props);
        assertProviderLocation(nextLocation);

        props = {
            ...props,
            userLocation: {
                ...nextLocation,
                isMoving: false,
                speed: 0,
                recordedAt: 13_900,
            },
        };
        output = await harness.render(props);
        assertProviderLocation(props.userLocation);

        props = { ...props, enabled: false };
        output = await harness.render(props);
        assert.equal(output, null);
        const count = harness.nativeLocations.length;
        context.mock.timers.tick(1000);
        await harness.render(props);
        assert.equal(harness.nativeLocations.length, count);
        assert.equal(harness.clearedMaps.length, nativeSupported ? 1 : 0);
    });
}
