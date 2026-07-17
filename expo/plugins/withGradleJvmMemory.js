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

const { AndroidConfig, createRunOncePlugin, withGradleProperties } =
    requireConfigPlugins();

const PLUGIN_NAME = 'with-gradle-jvm-memory';
const PLUGIN_VERSION = '1.0.0';
const GRADLE_JVM_ARGS = '-Xmx2048m -XX:MaxMetaspaceSize=1g';

function updateGradleJvmArgs(gradleProperties) {
    return AndroidConfig.BuildProperties.updateAndroidBuildProperty(
        gradleProperties,
        'org.gradle.jvmargs',
        GRADLE_JVM_ARGS,
    );
}

function withGradleJvmMemory(config) {
    return withGradleProperties(config, (nextConfig) => {
        nextConfig.modResults = updateGradleJvmArgs(nextConfig.modResults);

        return nextConfig;
    });
}

module.exports = Object.assign(
    createRunOncePlugin(withGradleJvmMemory, PLUGIN_NAME, PLUGIN_VERSION),
    { GRADLE_JVM_ARGS, updateGradleJvmArgs },
);
