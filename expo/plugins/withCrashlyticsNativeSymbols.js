const { createRequire } = require('module');

function requireConfigPlugins() {
    try {
        return require('expo/config-plugins');
    } catch {
        return createRequire(`${process.cwd()}/package.json`)(
            'expo/config-plugins',
        );
    }
}

const { createRunOncePlugin, withAppBuildGradle } = requireConfigPlugins();
const MARKER = '// DAF Crashlytics native symbols';
const NATIVE_SYMBOLS_BLOCK = `${MARKER}
pluginManager.withPlugin('com.google.firebase.crashlytics') {
    android.buildTypes.release.firebaseCrashlytics {
        nativeSymbolUploadEnabled true
        unstrippedNativeLibsDir file("$buildDir/intermediates/merged_native_libs/release/mergeReleaseNativeLibs/out/lib")
    }
    tasks.matching { it.name == 'generateCrashlyticsSymbolFileRelease' }.configureEach {
        dependsOn 'mergeReleaseNativeLibs'
    }
    tasks.matching { it.name == 'assembleRelease' || it.name == 'bundleRelease' }.configureEach {
        finalizedBy 'uploadCrashlyticsSymbolFileRelease'
    }
}
`;

function configureCrashlyticsNativeSymbols(contents) {
    if (contents.includes(MARKER)) {
        const legacyBlock =
            /\/\/ DAF Crashlytics native symbols\r?\nandroid\.buildTypes\.release\.firebaseCrashlytics \{[\s\S]*?\r?\n\}\r?\ntasks\.matching \{[^\r\n]*\}\.configureEach \{[\s\S]*?\r?\n\}\r?\n?/;
        const deferredBlock =
            /\/\/ DAF Crashlytics native symbols\r?\npluginManager\.withPlugin\('com\.google\.firebase\.crashlytics'\) \{[\s\S]*?\r?\n\}\r?\n?/;
        return contents
            .replace(legacyBlock, () => NATIVE_SYMBOLS_BLOCK)
            .replace(deferredBlock, () => NATIVE_SYMBOLS_BLOCK);
    }

    return `${contents}\n${NATIVE_SYMBOLS_BLOCK}`;
}

function withCrashlyticsNativeSymbols(config) {
    return withAppBuildGradle(config, (nextConfig) => {
        if (nextConfig.modResults.language !== 'groovy') {
            throw new Error(
                'Crashlytics native symbols require a Groovy app build.gradle.',
            );
        }

        nextConfig.modResults.contents = configureCrashlyticsNativeSymbols(
            nextConfig.modResults.contents,
        );
        return nextConfig;
    });
}

module.exports = Object.assign(
    createRunOncePlugin(
        withCrashlyticsNativeSymbols,
        'with-crashlytics-native-symbols',
        '1.0.0',
    ),
    { configureCrashlyticsNativeSymbols },
);
