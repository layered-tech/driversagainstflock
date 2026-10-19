import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { corridorSourceLabel } from '../road-corridor-source.js';

const require = createRequire(import.meta.url);
const source = readFileSync(
    new URL('../road-corridor-status.js', import.meta.url),
    'utf8',
);
const code = require('@babel/core').transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [
        [
            require('@babel/plugin-transform-react-jsx'),
            { runtime: 'automatic' },
        ],
        require('@babel/plugin-transform-modules-commonjs'),
    ],
}).code;

test('corridor diagnostics render active source and fallback reason as drawer content', () => {
    for (const snapshot of [
        { source: 'download', reason: null },
        { source: 'service', reason: 'Fetch failed' },
        { source: 'unavailable', reason: 'Waiting for roads' },
    ]) {
        const module = { exports: {} };
        const selections = [];
        const element = (type, props) => ({ type, props });
        const mocks = {
            react: {
                useEffect: () => {},
                useSyncExternalStore: (_, get) => get(),
            },
            'react-native': { Text: 'Text', View: 'View', Switch: 'Switch' },
            './road-corridor-pilot': {
                getCorridorRelease: () => ({
                    release: 'test',
                    forceService: false,
                    enabled: true,
                }),
                subscribeCorridorRelease() {},
                initializeCorridorReleases: async () => {},
                setCorridorServiceOnly: async (value) => {
                    selections.push(value);
                },
            },
            'react/jsx-runtime': { jsx: element, jsxs: element },
            './road-corridor-source': {
                corridorSourceLabel,
                getCorridorSource: () => snapshot,
                subscribeCorridorSource: () => () => {},
            },
        };
        new Function('require', 'module', 'exports', code)(
            (name) => mocks[name],
            module,
            module.exports,
        );
        const view = module.exports.RoadCorridorStatus();
        assert.ok(!view.props.className.includes('absolute'));
        const toggle = view.props.children[1].props.children[1];
        assert.equal(toggle.props.testID, 'road-corridor-service-only');
        toggle.props.onValueChange(true);
        assert.deepEqual(selections, [true]);
        assert.equal(view.props.style, undefined);
        assert.equal(
            view.props.children[0].props.children,
            corridorSourceLabel(snapshot),
        );
        assert.equal(
            view.props.children[0].props.testID,
            'road-corridor-source',
        );
    }
});
test('corridor status is mounted only inside its debug drawer section', () => {
    const screen = readFileSync(
        new URL('../../map-screen.js', import.meta.url),
        'utf8',
    );
    const drawer = readFileSync(
        new URL('../../root/debug-drawer.js', import.meta.url),
        'utf8',
    );
    assert.ok(!screen.includes('RoadCorridorStatus'));
    assert.match(
        drawer,
        /renderSection\(\s*'road-corridors',\s*'Road corridors',\s*\[\],\s*<RoadCorridorStatus \/>/,
    );
});
