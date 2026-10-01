import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { WEATHER_PROFILE_DEFAULTS } from '../weather-profiles.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const modules = require('@babel/plugin-transform-modules-commonjs');
const jsx = require('@babel/plugin-transform-react-jsx');

function loadComponent(mocks) {
    const source = readFileSync(
        new URL('../weather-effect.js', import.meta.url),
        'utf8',
    );
    const transformed = transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: [[jsx, { runtime: 'automatic' }], modules],
    }).code;
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        'setTimeout',
        'clearTimeout',
        transformed,
    )(
        (name) => {
            assert.ok(name in mocks, `Unexpected module ${name}`);
            return mocks[name];
        },
        module,
        module.exports,
        mocks.timers.set,
        mocks.timers.clear,
    );
    return module.exports.WeatherEffect;
}

function renderer({
    platform = 'ios',
    supported = true,
    nativeAvailable = true,
} = {}) {
    let snapshot = {
        rendered: null,
        preferences: { profiles: WEATHER_PROFILE_DEFAULTS },
    };
    let cursor = 0;
    let dirty = true;
    let output;
    let props = { car: false, styleKey: 'style-1' };
    const hooks = [];
    const effects = [];
    const timers = new Map();
    const reports = new Map();
    let sequence = 0;
    let time = 0;
    const equal = (a, b) =>
        a &&
        b &&
        a.length === b.length &&
        a.every((value, index) => Object.is(value, b[index]));
    const element = (type, props, key) => ({ type, props, key });
    const React = {
        useState(initial) {
            const index = cursor++;
            hooks[index] ??= { value: initial };
            return [
                hooks[index].value,
                (next) => {
                    const value =
                        typeof next === 'function'
                            ? next(hooks[index].value)
                            : next;
                    if (!Object.is(value, hooks[index].value)) {
                        hooks[index].value = value;
                        dirty = true;
                    }
                },
            ];
        },
        useRef(initial) {
            const index = cursor++;
            hooks[index] ??= { current: initial };
            return hooks[index];
        },
        useMemo(factory, dependencies) {
            const index = cursor++;
            if (!equal(hooks[index]?.dependencies, dependencies)) {
                hooks[index] = { value: factory(), dependencies };
            }
            return hooks[index].value;
        },
        useEffect(callback, dependencies) {
            const index = cursor++;
            if (!equal(hooks[index]?.dependencies, dependencies)) {
                effects.push(() => {
                    hooks[index]?.cleanup?.();
                    hooks[index] = { dependencies, cleanup: callback() };
                });
            }
        },
    };
    const Component = loadComponent({
        react: React,
        'react/jsx-runtime': { jsx: element },
        'react-native': {
            Platform: { OS: platform },
            UIManager: {
                getViewManagerConfig: () => (nativeAvailable ? {} : null),
            },
        },
        '@rnmapbox/maps': supported
            ? { Rain: 'native-rain', Snow: 'native-snow' }
            : {},
        './weather-runtime': {
            useWeatherSurface: (car) => {
                assert.equal(car, props.car);
                return snapshot;
            },
            weatherStore: {
                reportRenderer(token, status) {
                    reports.set(token, status);
                },
                removeRenderer(token) {
                    reports.delete(token);
                },
            },
        },
        './weather-profiles': require('../weather-profiles.js'),
        timers: {
            set(callback, delay) {
                const id = ++sequence;
                timers.set(id, { callback, at: time + delay });
                return id;
            },
            clear(id) {
                timers.delete(id);
            },
        },
    });
    function flush() {
        let renders = 0;
        while (dirty || effects.length) {
            assert.ok(renders++ < 20, 'Render loop');
            if (dirty) {
                dirty = false;
                cursor = 0;
                output = Component(props);
            }
            for (const effect of effects.splice(0)) {
                effect();
            }
        }
        return output;
    }
    flush();
    return {
        current: () => output,
        condition(value) {
            snapshot = { ...snapshot, rendered: value };
            dirty = true;
            return flush();
        },
        profiles(value) {
            snapshot = { ...snapshot, preferences: { profiles: value } };
            dirty = true;
            return flush();
        },
        intensityBucket(value) {
            snapshot = { ...snapshot, renderedIntensityBucket: value };
            dirty = true;
            return flush();
        },
        style(key) {
            props = { ...props, styleKey: key };
            dirty = true;
            return flush();
        },
        car(value) {
            props = { ...props, car: value };
            dirty = true;
            return flush();
        },
        advance(ms) {
            time += ms;
            const due = [...timers.entries()].filter(
                ([, timer]) => timer.at <= time,
            );
            for (const [id, timer] of due) {
                timers.delete(id);
                timer.callback();
            }
            return flush();
        },
        unmount() {
            for (const hook of hooks) {
                hook?.cleanup?.();
            }
        },
        timers,
        reports,
    };
}

for (const platform of ['ios', 'android']) {
    test(`${platform}: native rain and snow fade sequentially and reapply after style reload`, () => {
        const surface = renderer({ platform });
        assert.equal(surface.current(), null);
        surface.car(true);
        surface.condition('Rain');
        assert.equal(surface.current().type, 'native-rain');
        assert.equal(surface.current().props.style.opacity, 0);
        surface.advance(32);
        assert.equal(surface.current().props.style.opacity, 0.35);
        surface.condition('Snow');
        assert.equal(surface.current().type, 'native-rain');
        assert.equal(surface.current().props.style.opacity, 0);
        surface.advance(1999);
        assert.equal(surface.current().type, 'native-rain');
        surface.advance(1);
        assert.equal(surface.current().type, 'native-snow');
        assert.equal(surface.current().props.style.opacity, 0);
        surface.advance(32);
        assert.equal(surface.current().props.style.opacity, 0.65);
        assert.equal([...surface.reports.values()][0].effect, 'Snow');
        surface.style('reconnected-style-2');
        assert.equal(surface.current().key, 'Snow-reconnected-style-2');
        assert.equal(surface.current().props.style.opacity, 0.65);
        surface.condition(null);
        assert.equal(surface.current().props.style.opacity, 0);
        surface.advance(2000);
        assert.equal(surface.current(), null);
        surface.unmount();
        assert.equal(surface.timers.size, 0);
        assert.equal(surface.reports.size, 0);
    });
}

test('live profile edits update the rendered native effect and control transition timing', () => {
    const surface = renderer();
    surface.condition('Rain');
    surface.advance(32);
    surface.profiles({
        ...WEATHER_PROFILE_DEFAULTS,
        Rain: {
            ...WEATHER_PROFILE_DEFAULTS.Rain,
            opacity: 0.2,
            density: 0.3,
            transitionDuration: 3,
            transitionDelay: 1,
        },
    });
    assert.equal(surface.current().props.style.opacity, 0.2);
    assert.equal(surface.current().props.style.density, 0.3);
    assert.deepEqual(surface.current().props.style.opacityTransition, {
        duration: 3000,
        delay: 1000,
    });
    surface.condition('Snow');
    surface.advance(3999);
    assert.equal(surface.current().type, 'native-rain');
    surface.advance(1);
    assert.equal(surface.current().type, 'native-snow');
    surface.unmount();
});

test('rapid override changes cancel obsolete fades and cleanup pending timers', () => {
    const surface = renderer();
    surface.condition('Rain');
    surface.advance(32);
    surface.condition('Snow');
    surface.advance(500);
    surface.condition('Rain');
    surface.advance(2500);
    assert.equal(surface.current().type, 'native-rain');
    assert.equal(surface.current().props.style.opacity, 0.35);
    surface.condition('Snow');
    surface.unmount();
    assert.equal(surface.timers.size, 0);
});

test('unsupported platform or missing native effect export renders none', () => {
    for (const options of [
        { platform: 'web' },
        { supported: false },
        { nativeAvailable: false },
    ]) {
        const surface = renderer(options);
        surface.condition('Snow');
        surface.advance(32);
        assert.equal(surface.current(), null);
        surface.unmount();
    }
});

test('shared MapCanvas wires phone and car effects to its style attachment epoch', () => {
    const source = readFileSync(
        new URL('../map-canvas.js', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /<WeatherEffect[\s\S]*?car=\{navigationPuckVariant === 'auto-play'\}/,
    );
    assert.match(
        source,
        /styleKey=\{`\$\{mapStyleURL\}-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
    assert.match(
        source,
        /onDidFinishLoadingStyle=\{refreshLocationPuckAfterMapAttachment\}/,
    );
    const controls = readFileSync(
        new URL('../map-layer-controls.js', import.meta.url),
        'utf8',
    );
    assert.match(
        controls,
        /label="Rain and snow effects"[\s\S]*?onValueChange=\{weatherStore\.setEnabled\}/,
    );
    const drawer = readFileSync(
        new URL('../../root/debug-drawer.js', import.meta.url),
        'utf8',
    );
    assert.match(drawer, /<WeatherDebugPane \/>/);
});

test('intensity changes update density in place with a smooth native transition', () => {
    const surface = renderer();
    surface.condition('Rain');
    surface.advance(32);
    const key = surface.current().key;
    surface.intensityBucket('Light');
    assert.equal(surface.current().key, key);
    assert.equal(surface.current().props.style.density, 0.075);
    assert.equal(surface.current().props.style.opacity, 0.35);
    assert.equal(
        surface.timers.size,
        0,
        'intensity does not restart effect fade timers',
    );
    surface.intensityBucket('Heavy');
    assert.equal(surface.current().key, key);
    assert.equal(surface.current().props.style.density, 0.15 * 1.75);
    assert.equal(surface.current().props.style.intensity, 0.35);
    assert.deepEqual(surface.current().props.style.densityTransition, {
        duration: 2000,
        delay: 0,
    });
    assert.equal([...surface.reports.values()][0].intensityBucket, 'Heavy');
    surface.intensityBucket('Baseline');
    assert.equal(surface.current().props.style.density, 0.15);
    surface.unmount();
});

test('outgoing precipitation retains its old intensity until replacement', () => {
    const surface = renderer();
    surface.condition('Rain');
    surface.advance(32);
    surface.intensityBucket('Heavy');
    surface.condition('Snow');
    surface.intensityBucket('Light');
    assert.equal(surface.current().type, 'native-rain');
    assert.equal([...surface.reports.values()][0].intensityBucket, 'Heavy');
    surface.advance(2000);
    surface.advance(32);
    assert.equal(surface.current().type, 'native-snow');
    assert.equal(surface.current().props.style.density, 0.1);
    assert.equal([...surface.reports.values()][0].intensityBucket, 'Light');
    surface.unmount();
});
