import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as presentation from '../location-puck-presentation.js';
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
        './api-mocks': { mapApiMocksAreEnabled: () => false },
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
        './location-puck-presentation': presentation,
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
    test(`advances the ${nativeSupported ? 'native' : 'fallback'} provider between fixes and stops on disable`, async (context) => {
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
            longitude: -87.6298,
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
        const getCoordinate = () =>
            nativeSupported
                ? harness.nativeLocations.at(-1).coordinate
                : output.props.coordinate;
        let previous = getCoordinate();

        for (let frame = 0; frame < 9; frame++) {
            context.mock.timers.tick(100);
            output = await harness.render(props);
            const coordinate = getCoordinate();
            assert.ok(
                coordinate[0] > previous[0],
                'Puck must advance without a new GPS fix',
            );
            previous = coordinate;
            if (nativeSupported) {
                assert.equal(
                    harness.nativeLocations.at(-1).recordedAt,
                    location.recordedAt,
                );
            }
        }
        assert.equal(harness.clearedMaps.length, 0);

        props = {
            ...props,
            userLocation: {
                ...location,
                isMoving: false,
                speed: 0,
                recordedAt: 10_900,
            },
        };
        output = await harness.render(props);
        const stoppedCoordinate = getCoordinate();
        context.mock.timers.tick(500);
        output = await harness.render(props);
        assert.deepEqual(getCoordinate(), stoppedCoordinate);

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
