import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {
    configureCrashlyticsNativeSymbols,
} = require('../../plugins/withCrashlyticsNativeSymbols.js');
const withCrashlyticsNativeSymbols = require('../../plugins/withCrashlyticsNativeSymbols.js');
const withFirebaseCrashlytics =
    require('@react-native-firebase/crashlytics/app.plugin.js').default;
const { withPlugins } = require('expo/config-plugins');

function assertDeferredNativeSymbols(contents) {
    assert.match(
        contents,
        /pluginManager\.withPlugin\('com\.google\.firebase\.crashlytics'\) \{\s+android\.buildTypes\.release\.firebaseCrashlytics \{/,
    );
}

test('adds native symbol processing and uploading once to release builds', () => {
    const contents =
        "apply plugin: 'com.google.firebase.crashlytics'\nandroid { buildTypes { release {} } }\n";
    const output = configureCrashlyticsNativeSymbols(contents);
    assertDeferredNativeSymbols(output);
    assert.match(output, /nativeSymbolUploadEnabled true/);
    assert.match(
        output,
        /merged_native_libs\/release\/mergeReleaseNativeLibs\/out\/lib/,
    );
    assert.match(output, /assembleRelease.*bundleRelease/);
    assert.match(output, /finalizedBy 'uploadCrashlyticsSymbolFileRelease'/);
    assert.equal(configureCrashlyticsNativeSymbols(output), output);
});

test('repairs the existing eager native symbol block without changing other Gradle settings', () => {
    const prefix = 'android { buildTypes { release {} } }\n';
    const suffix = "\napply plugin: 'com.google.firebase.crashlytics'\n";
    const legacy = `${prefix}// DAF Crashlytics native symbols
android.buildTypes.release.firebaseCrashlytics {
    nativeSymbolUploadEnabled true
    unstrippedNativeLibsDir file("$buildDir/intermediates/merged_native_libs/release/mergeReleaseNativeLibs/out/lib")
}
tasks.matching { it.name == 'assembleRelease' || it.name == 'bundleRelease' }.configureEach {
    finalizedBy 'uploadCrashlyticsSymbolFileRelease'
}
${suffix}`;
    const output = configureCrashlyticsNativeSymbols(legacy);

    assertDeferredNativeSymbols(output);
    assert.ok(output.startsWith(prefix));
    assert.ok(output.endsWith(suffix));
    assert.equal(output.match(/nativeSymbolUploadEnabled true/g)?.length, 1);
    assert.equal(configureCrashlyticsNativeSymbols(output), output);
});

test('defers native symbols in the actual Expo mod chain regardless of Firebase plugin order', async () => {
    for (const plugins of [
        [withFirebaseCrashlytics, withCrashlyticsNativeSymbols],
        [withCrashlyticsNativeSymbols, withFirebaseCrashlytics],
    ]) {
        const config = withPlugins(
            {
                name: 'test',
                slug: 'test',
                _internal: {
                    projectRoot: fileURLToPath(
                        new URL('../../', import.meta.url),
                    ),
                },
            },
            plugins,
        );
        const result = await config.mods.android.appBuildGradle({
            ...config,
            modResults: {
                language: 'groovy',
                contents: 'android { buildTypes { release {} } }\n',
            },
            modRequest: { platform: 'android', modName: 'appBuildGradle' },
        });

        assertDeferredNativeSymbols(result.modResults.contents);
        assert.equal(
            result.modResults.contents.match(
                /apply plugin: 'com.google.firebase.crashlytics'/g,
            )?.length,
            1,
        );
    }
});

test('configures Crashlytics and matching Firebase SDK versions for every app environment', () => {
    const source = readFileSync(
        new URL('../../app.config.js', import.meta.url),
        'utf8',
    );
    const manifest = JSON.parse(
        readFileSync(new URL('../../package.json', import.meta.url)),
    );
    const lock = JSON.parse(
        readFileSync(new URL('../../package-lock.json', import.meta.url)),
    );
    const appVersion =
        lock.packages['node_modules/@react-native-firebase/app'].version;
    assert.equal(
        lock.packages['node_modules/@react-native-firebase/crashlytics']
            .version,
        appVersion,
    );
    assert.equal(manifest.dependencies['@sentry/react-native'], undefined);
    assert.ok(
        Object.keys(lock.packages).every((name) => !name.includes('@sentry/')),
    );
    for (const environment of ['development', 'staging', 'production', 'e2e']) {
        const context = {
            module: { exports: {} },
            process: { env: { APP_ENV: environment } },
            require: (name) => {
                assert.equal(name, './package.json');
                return manifest;
            },
        };
        vm.runInNewContext(source, context);
        const config = context.module.exports;
        const pluginNames = config.plugins.map((plugin) =>
            Array.isArray(plugin) ? plugin[0] : plugin,
        );
        assert.ok(pluginNames.includes('@react-native-firebase/crashlytics'));
        assert.ok(
            pluginNames.includes('./plugins/withCrashlyticsNativeSymbols'),
        );
        assert.ok(pluginNames.every((name) => !name.includes('sentry')));
        assert.ok(config.android.googleServicesFile);
        assert.ok(config.ios.googleServicesFile);
    }
});

test('enables native, NDK, and JS crash coverage without duplicate fatal reports', () => {
    const config = JSON.parse(
        readFileSync(new URL('../../firebase.json', import.meta.url)),
    )['react-native'];
    assert.equal(config.crashlytics_auto_collection_enabled, true);
    assert.equal(config.crashlytics_debug_enabled, true);
    assert.equal(config.crashlytics_ndk_enabled, true);
    assert.equal(
        config.crashlytics_is_error_generation_on_js_crash_enabled,
        true,
    );
    assert.equal(
        config.crashlytics_javascript_exception_handler_chaining_enabled,
        false,
    );
    assert.equal(
        config.google_analytics_automatic_screen_reporting_enabled,
        false,
    );
});
