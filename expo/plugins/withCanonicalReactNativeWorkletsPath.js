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

const PLUGIN_NAME = 'with-canonical-react-native-worklets-path';
const PLUGIN_VERSION = '1.0.0';
const GENERATED_TAG = 'canonical-react-native-worklets-path';
const WORKLETS_PATH_BLOCK = `def reactNativeWorkletsProject = rootProject.findProject(":react-native-worklets")
ext.REACT_NATIVE_WORKLETS_NODE_MODULES_DIR = reactNativeWorkletsProject != null
    ? reactNativeWorkletsProject.projectDir.parentFile.canonicalPath
    : new File(projectRoot, "node_modules/react-native-worklets").canonicalPath`;

function updateAppBuildGradle(source) {
    const header = `// @generated begin ${GENERATED_TAG}`;
    const footer = `// @generated end ${GENERATED_TAG}`;
    const generatedBlockPattern = new RegExp(
        `\\n?// @generated begin ${GENERATED_TAG}[\\s\\S]*?// @generated end ${GENERATED_TAG}\\n?`,
        'm',
    );
    const sanitizedSource = source.replace(generatedBlockPattern, '\n');
    const anchor =
        /def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\).*\n/;
    const match = sanitizedSource.match(anchor);

    if (!match || match.index == null) {
        throw new Error(
            `[${PLUGIN_NAME}] Unable to find projectRoot in app/build.gradle.`,
        );
    }

    const insertionIndex = match.index + match[0].length;
    const wrappedBlock = `${header}\n${WORKLETS_PATH_BLOCK}\n${footer}\n`;

    return `${sanitizedSource.slice(0, insertionIndex)}${wrappedBlock}${sanitizedSource.slice(insertionIndex)}`;
}

function withCanonicalReactNativeWorkletsPath(config) {
    return withAppBuildGradle(config, (nextConfig) => {
        nextConfig.modResults.contents = updateAppBuildGradle(
            nextConfig.modResults.contents,
        );

        return nextConfig;
    });
}

module.exports = Object.assign(
    createRunOncePlugin(
        withCanonicalReactNativeWorkletsPath,
        PLUGIN_NAME,
        PLUGIN_VERSION,
    ),
    { updateAppBuildGradle },
);
