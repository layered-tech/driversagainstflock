const { readFileSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const {
    createRunOncePlugin,
    withDangerousMod,
    withPodfile,
} = require('expo/config-plugins');

function configureCompilerCompatPodfile(source) {
    const contents = source.replace(
        /\n?# @generated begin expo-(?:swift-consuming-pattern|sdk58-native-compatibility)[\s\S]*?# @generated end expo-(?:swift-consuming-pattern|sdk58-native-compatibility)\n?/,
        '\n',
    );
    const anchor = 'prepare_react_native_project!\n';
    if (!contents.includes(anchor)) {
        throw new Error(
            'Expo SDK 58 compatibility requires the React Native Podfile setup.',
        );
    }
    const block = `# @generated begin expo-sdk58-native-compatibility
unless system('node', File.expand_path('../plugins/withExpoSdk58Compat.js', __dir__), File.expand_path('..', __dir__))
  abort 'Unable to apply Expo SDK 58 native compatibility'
end
# @generated end expo-sdk58-native-compatibility
`;
    return contents.replace(anchor, `${anchor}${block}`);
}

function fixConsumingErrorPattern(source) {
    // Swift 6.4 crashes in SILGen when the consuming enum pattern also erases
    // its error type. Keep ownership intact and erase the type in the body.
    return source.replace(
        'case .failure(let error as any Error):\n          promise.reject(error)',
        'case .failure(let error):\n          promise.reject(error as any Error)',
    );
}

function patchExpoAsyncFunction(projectRoot) {
    const expoRequire = createRequire(
        require.resolve('expo/package.json', { paths: [projectRoot] }),
    );
    const sourcePath = path.join(
        path.dirname(expoRequire.resolve('expo-modules-core/package.json')),
        'ios/Core/Functions/AsyncFunctionDefinition.swift',
    );
    const source = readFileSync(sourcePath, 'utf8');
    const patched = fixConsumingErrorPattern(source);
    if (patched !== source) {
        writeFileSync(sourcePath, patched);
    }
}

function fixMapboxLayoutMetrics(source) {
    return source.replace(
        /LayoutMetrics newLayoutMetrics = LayoutMetrics\{\s*RCTRectFromCGRect\(next\),[\s\S]*?layoutMetrics\.overflowInset\s*\};/,
        'LayoutMetrics newLayoutMetrics = layoutMetrics;\n    newLayoutMetrics.frame = RCTRectFromCGRect(next);',
    );
}

function patchNativeDependencies(projectRoot) {
    patchExpoAsyncFunction(projectRoot);
    const sourcePath = path.join(
        path.dirname(
            require.resolve('@rnmapbox/maps/package.json', {
                paths: [projectRoot],
            }),
        ),
        'ios/RNMBX/RNMBXMarkerViewComponentView.mm',
    );
    const source = readFileSync(sourcePath, 'utf8');
    const patched = fixMapboxLayoutMetrics(source);
    if (patched !== source) writeFileSync(sourcePath, patched);
}

function withExpoSdk58Compat(config) {
    const nextConfig = withPodfile(config, (podfileConfig) => {
        podfileConfig.modResults.contents = configureCompilerCompatPodfile(
            podfileConfig.modResults.contents,
        );
        return podfileConfig;
    });
    return withDangerousMod(nextConfig, [
        'ios',
        (nextConfig) => {
            patchNativeDependencies(nextConfig.modRequest.projectRoot);
            return nextConfig;
        },
    ]);
}

module.exports = Object.assign(
    createRunOncePlugin(withExpoSdk58Compat, 'with-expo-sdk58-compat', '1.0.0'),
    {
        configureCompilerCompatPodfile,
        fixConsumingErrorPattern,
        fixMapboxLayoutMetrics,
        patchNativeDependencies,
        patchExpoAsyncFunction,
    },
);

if (require.main === module) {
    patchNativeDependencies(process.argv[2] ?? process.cwd());
}
