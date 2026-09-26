import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );
const appConfig = require('../../../app.config.js');
const packageJson = require('../../../package.json');
const autoPlayPodspecSource = readFileSync(
    join(autoPlayPackageRoot, 'ReactNativeAutoPlay.podspec'),
    'utf8',
);
const nitroLinkingManagerSource = readFileSync(
    join(autoPlayPackageRoot, 'ios/ReactHelpers/NitroLinkingManager.m'),
    'utf8',
);
const linkingManagerCategorySource = readFileSync(
    join(autoPlayPackageRoot, 'ios/ReactHelpers/RCTLinkingManager+Custom.mm'),
    'utf8',
);
const dynamicFrameworksCompatPlugin = readFileSync(
    new URL('../../../plugins/withDynamicFrameworksCompat.js', import.meta.url),
    'utf8',
);

test('iOS retains its source-built React Native framework configuration', () => {
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

test('AutoPlay installs native timers before every other app import', () => {
    const entry = readFileSync(
        new URL('../../../index.js', import.meta.url),
        'utf8',
    );
    assert.match(
        entry,
        /^import '@iternio\/react-native-auto-play\/installTimers';/,
    );
    assert.equal(
        existsSync(
            new URL(
                '../../../patches/react-native+0.86.2.patch',
                import.meta.url,
            ),
        ),
        false,
    );
    const timingSource = readFileSync(
        join(autoPlayPackageRoot, 'src/utils/AutoPlayTimers.ts'),
        'utf8',
    );
    for (const name of [
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
    ]) {
        assert.ok(timingSource.includes(`globalThis.${name} =`));
    }
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

test('AutoPlay resolves React Native linking at the final app link', () => {
    assert.match(autoPlayPodspecSource, /^ {2}s\.static_framework = true$/m);
    assert.doesNotMatch(
        autoPlayPodspecSource,
        /s\.dependency 'React-RCTLinking'/,
    );
    assert.match(
        autoPlayPodspecSource,
        /^ {2}s\.dependency 'React-Core\/RCTLinkingHeaders'$/m,
    );
    assert.match(
        nitroLinkingManagerSource,
        /#import "React\/RCTLinkingManager\.h"[\s\S]*?\[RCTLinkingManager application:/,
    );
    assert.match(
        linkingManagerCategorySource,
        /#import <React\/RCTLinkingManager\.h>[\s\S]*?@implementation RCTLinkingManager \(Custom\)/,
    );
});
