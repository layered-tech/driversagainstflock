import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getWeatherDiagnostics } from '../weather-diagnostics.js';
import { createWeatherState } from '../weather-policy.js';
import { WEATHER_PROFILE_DEFAULTS } from '../weather-profiles.js';

const require = createRequire(import.meta.url);
const { code } = require('@babel/core').transformSync(
    readFileSync(new URL('../weather-debug-pane.js', import.meta.url), 'utf8'),
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

test('weather drawer exposes current state before opening JSON and updates observation age with cleanup', (t) => {
    let time = Date.parse('2026-10-01T12:00:00Z');
    t.mock.method(Date, 'now', () => time);
    const snapshot = {
        state: createWeatherState(),
        raw: {
            condition: 'Unknown',
            description: 'Rain nearby',
            reason: 'unclassifiable',
            observedAt: time,
            stationLocation: { latitude: 40, longitude: -100 },
            presentWeather: [{ weather: 'rain', inVicinity: true }],
        },
        location: { latitude: 40, longitude: -100 },
        mode: 'Automatic',
        preferences: { enabled: true, profiles: WEATHER_PROFILE_DEFAULTS },
        rolloutEnabled: true,
        hydrated: true,
        active: true,
        rendered: null,
        failures: 1,
        renderers: [{ surface: 'Phone', supported: false, visible: false }],
    };
    const states = [];
    let cursor = 0;
    let effect;
    let cleanup;
    let interval;
    let cleared = false;
    const element = (type, props) => ({ type, props });
    const mocks = {
        react: {
            useState(initial) {
                const index = cursor++;
                if (!(index in states)) {
                    states[index] =
                        typeof initial === 'function' ? initial() : initial;
                }
                return [
                    states[index],
                    (value) => {
                        states[index] = value;
                    },
                ];
            },
            useEffect(callback) {
                effect ??= callback;
            },
        },
        'react/jsx-runtime': { jsx: element, jsxs: element },
        'react-native': Object.fromEntries(
            ['Pressable', 'Switch', 'Text', 'TextInput', 'View'].map((name) => [
                name,
                name,
            ]),
        ),
        './weather-profiles': { WEATHER_PROFILE_DEFAULTS },
        './weather-diagnostics': { getWeatherDiagnostics },
        './weather-runtime': {
            useWeatherState: () => snapshot,
            weatherStore: {},
        },
    };
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        'setInterval',
        'clearInterval',
        code,
    )(
        (name) => {
            assert.ok(name in mocks, name);
            return mocks[name];
        },
        module,
        module.exports,
        (callback, ms) => {
            assert.equal(ms, 15000);
            interval = callback;
            return 1;
        },
        (id) => {
            assert.equal(id, 1);
            cleared = true;
        },
    );
    const render = () => {
        cursor = 0;
        return module.exports.WeatherDebugPane();
    };
    const nodes = (node) => {
        if (Array.isArray(node)) {
            return node.flatMap(nodes);
        }
        if (!node || typeof node !== 'object') {
            return [];
        }
        if (typeof node.type === 'function') {
            return nodes(node.type(node.props));
        }
        return [node, ...nodes(node.props.children)];
    };
    const text = (node) => {
        if (Array.isArray(node)) {
            return node.map(text).join('');
        }
        if (!node || typeof node !== 'object') {
            return node ?? '';
        }
        return text(node.props.children);
    };
    const before = render();
    cleanup = effect();
    assert.ok(
        nodes(before).some(
            (node) => node.props.testID === 'debug-weather-current-state',
        ),
    );
    assert.match(text(before), /NWS report: Unknown.*Rain nearby/);
    assert.match(text(before), /NWS result: unclassifiable/);
    assert.match(
        text(before),
        /Phone renderer: Native weather renderer unsupported/,
    );
    assert.match(text(before), /0.0 min old/);
    assert.doesNotMatch(text(before), /"accepted":/);
    const diagnostics = nodes(before).find(
        (node) => node.type === 'Pressable' && text(node) === 'Diagnostics',
    );
    diagnostics.props.onPress();
    assert.match(text(render()), /"accepted": "Unknown"/);
    time += 60_000;
    interval();
    assert.match(text(render()), /1.0 min old/);
    cleanup();
    assert.equal(cleared, true);
});
