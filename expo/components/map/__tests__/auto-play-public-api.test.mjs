import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createAutoPlaySearchCallbackState } from '../../auto-play-template-state.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonJs = require.resolve('@babel/plugin-transform-modules-commonjs');
const packageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : new URL(
          '../../../node_modules/@iternio/react-native-auto-play/',
          import.meta.url,
      ).pathname;

test('the public map API uses the upstream stop method without a reason', () => {
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
    assert.equal(NavigationStopReason, undefined);
    template.stopNavigation();
    assert.deepEqual(calls, [['test-map']]);
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

test('typing clears saved suggestions and clearing text restores them', () => {
    const source = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    const callback = source.match(
        /onSearchTextChanged: (\(searchText\) => \{[\s\S]*?\n\s*\}),/,
    )[1];
    const template = {};
    const initialResults = { type: 'default', items: [] };
    const calls = [];
    let initialResultsRefreshed = 0;
    const handler = vm.runInNewContext(`(${callback})`, {
        cancelAutoPlaySearchWork() {},
        emptyResults: initialResults,
        initialVoiceSearchIsPending: false,
        refreshInitialResults() {
            initialResultsRefreshed += 1;
        },
        savedLocationWasSelected: false,
        searchCallbackState: createAutoPlaySearchCallbackState(),
        searchTextValue: '',
        template,
        updateSearchTemplateSection: (...args) => calls.push(args),
    });
    handler('Austin');
    assert.deepEqual(calls, [[template, initialResults]]);
    handler('');
    assert.equal(initialResultsRefreshed, 1);
});
