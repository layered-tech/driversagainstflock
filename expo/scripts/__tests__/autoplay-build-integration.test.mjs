import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../plugins/withDynamicFrameworksCompat.js', import.meta.url),
    'utf8',
);
function loadPlugin() {
    const context = {
        module: { exports: {} },
        process,
        require(name) {
            if (name === 'module')
                return { createRequire: () => context.require };
            if (name === 'expo/config-plugins')
                return {
                    createRunOncePlugin: (plugin) => plugin,
                    withPodfile: (config, callback) => callback(config),
                };
            throw new Error(`Unexpected module ${name}`);
        },
    };
    vm.runInNewContext(source, context);
    return context.module.exports;
}

test('app build integration scopes AutoPlay static linking and stays idempotent', () => {
    const plugin = loadPlugin();
    const config = {
        modResults: {
            contents:
                'prepare_react_native_project!\npre_install do |installer|\nend\npost_install do |installer|\nend\n',
        },
    };
    const once = plugin(config).modResults.contents;
    assert.match(
        once,
        /pre_install do \|installer\|[\s\S]*?if target.name == 'ReactNativeAutoPlay'[\s\S]*?Pod::BuildType.static_framework/,
    );
    assert.match(
        once,
        /if podfile_properties\['ios.useFrameworks'\] == 'dynamic'/,
    );
    assert.equal(plugin(config).modResults.contents, once);
    assert.equal(once.match(/def target.build_type/g)?.length, 1);
});
