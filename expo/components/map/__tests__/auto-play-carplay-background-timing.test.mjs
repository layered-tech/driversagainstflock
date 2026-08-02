import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const appConfig = require('../../../app.config.js');
const packageJson = require('../../../package.json');
const reactNativePatch = readFileSync(
    new URL('../../../patches/react-native+0.86.2.patch', import.meta.url),
    'utf8',
);
const reactNativeTimingHeader = readFileSync(
    new URL(
        '../../../node_modules/react-native/React/CoreModules/RCTTiming.h',
        import.meta.url,
    ),
    'utf8',
);
const reactNativeTimingSource = readFileSync(
    new URL(
        '../../../node_modules/react-native/React/CoreModules/RCTTiming.mm',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayPatch = readFileSync(
    new URL(
        '../../../patches/@iternio+react-native-auto-play+0.4.7.patch',
        import.meta.url,
    ),
    'utf8',
);
const dynamicFrameworksCompatPlugin = readFileSync(
    new URL('../../../plugins/withDynamicFrameworksCompat.js', import.meta.url),
    'utf8',
);

test('iOS compiles the patched React Native source', () => {
    const buildPropertiesPlugin = appConfig.plugins.find(
        (plugin) =>
            Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    assert.equal(packageJson.dependencies['react-native'], '0.86.2');
    assert.equal(
        buildPropertiesPlugin?.[1]?.ios?.buildReactNativeFromSource,
        true,
    );
});

test('React Native wakes background JavaScript timers in CarPlay run-loop modes', () => {
    assert.doesNotMatch(reactNativePatch, /RCTTiming\.h/);
    assert.match(
        reactNativePatch,
        /diff --git a\/node_modules\/react-native\/React\/CoreModules\/RCTTiming\.mm/,
    );
    assert.match(
        reactNativePatch,
        /^- {6}\[\[NSRunLoop currentRunLoop\] addTimer:_sleepTimer forMode:NSDefaultRunLoopMode\];$/m,
    );
    assert.match(
        reactNativePatch,
        /^\+ {6}\[\[NSRunLoop currentRunLoop\] addTimer:_sleepTimer forMode:NSRunLoopCommonModes\];$/m,
    );
    assert.match(reactNativeTimingHeader, /RCTFrameUpdateObserver/);
    assert.match(reactNativeTimingSource, /NSTimer \*_sleepTimer;/);
    assert.match(reactNativeTimingSource, /@synthesize paused = _paused;/);
    assert.doesNotMatch(reactNativeTimingSource, /NSTimer \*_frameTimer;/);
});

test('source-built rnmapbox links the split React Native frameworks', () => {
    assert.match(
        dynamicFrameworksCompatPlugin,
        /uses_dynamic_frameworks = podfile_properties\['ios\.useFrameworks'\] == 'dynamic' \|\| ENV\['USE_FRAMEWORKS'\] == 'dynamic'/,
    );
    assert.match(
        dynamicFrameworksCompatPlugin,
        /if uses_dynamic_frameworks && podfile_properties\['ios\.buildReactNativeFromSource'\] == 'true'/,
    );

    for (const [targetName, productName] of [
        ['React-Fabric', 'React_Fabric.framework'],
        ['React-graphics', 'React_graphics.framework'],
        ['React-utils', 'React_utils.framework'],
        ['React-debug', 'React_debug.framework'],
        ['glog', 'glog.framework'],
    ]) {
        assert.match(
            dynamicFrameworksCompatPlugin,
            new RegExp(`'${targetName}' => '${productName}'`),
        );
    }

    assert.match(
        dynamicFrameworksCompatPlugin,
        /rnmapbox_target\.add_dependency\(dependency_target\)/,
    );
    assert.match(
        dynamicFrameworksCompatPlugin,
        /rnmapbox_target\.frameworks_build_phase\.add_file_reference\(dependency_target\.product_reference, true\)/,
    );
});

test('AutoPlay links the React Native linking manager it calls', () => {
    assert.match(
        autoPlayPatch,
        /diff --git a\/node_modules\/@iternio\/react-native-auto-play\/ReactNativeAutoPlay\.podspec/,
    );
    assert.match(autoPlayPatch, /^\+ {2}s\.dependency 'React-RCTLinking'$/m);
});
