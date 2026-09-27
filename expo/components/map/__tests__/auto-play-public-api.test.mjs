import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonJs = require.resolve('@babel/plugin-transform-modules-commonjs');
const packageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : new URL(
          '../../../node_modules/@iternio/react-native-auto-play/',
          import.meta.url,
      ).pathname;

test('the public map API forwards arrival and cancellation to the native bridge', () => {
    const calls = [];
    const source = readFileSync(
        resolve(packageRoot, 'lib/templates/MapTemplate.js'),
        'utf8',
    );
    const { code } = transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: [commonJs],
    });
    const context = vm.createContext({
        exports: {},
        require(name) {
            if (name === 'react-native-nitro-modules') {
                return {
                    NitroModules: {
                        createHybridObject: () => ({
                            stopNavigation: (...args) => calls.push(args),
                        }),
                    },
                };
            }
            return { Template: class {} };
        },
    });
    vm.runInContext(code, context);
    const { MapTemplate, NavigationStopReason } = context.exports;
    const template = Object.create(MapTemplate.prototype);
    template.id = 'test-map';
    template.stopNavigation(NavigationStopReason.Arrived);
    template.stopNavigation(NavigationStopReason.Cancelled);
    template.stopNavigation();
    assert.deepEqual(calls, [
        ['test-map', 0],
        ['test-map', 1],
        ['test-map', 1],
    ]);
});

test('Dashboard setup works with the upstream void-returning setButtons method', () => {
    const source = readFileSync(
        new URL('../../auto-play-platform.ios.js', import.meta.url),
        'utf8',
    );
    const fn = source.match(/function applyDashboardButtons\([\s\S]*?\n\}/)[0];
    const setup = vm.runInNewContext(`(${fn})`);
    let buttons;
    assert.doesNotThrow(() =>
        setup(
            {
                setButtons(value) {
                    buttons = value;
                },
            },
            (name) => name,
        ),
    );
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].launchHeadUnitScene, true);
    assert.equal(buttons[0].titleVariants[0], 'Open map');
});

test('typing completes the upstream search callback through its public results API', () => {
    const source = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    const callback = source.match(
        /onSearchTextChanged: (\(\) => \{[\s\S]*?\n\s*\}),/,
    )[1];
    const template = {};
    const initialResults = { type: 'default', items: [] };
    const calls = [];
    const handler = vm.runInNewContext(`(${callback})`, {
        template,
        initialResults,
        updateSearchTemplateSection: (...args) => calls.push(args),
    });
    handler('Austin');
    assert.deepEqual(calls, [[template, initialResults]]);
});
