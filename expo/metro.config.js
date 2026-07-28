const path = require('path');
const { withNativeWind } = require('nativewind/metro');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.resolver = {
    ...(config.resolver ?? {}),
    nodeModulesPaths: [
        path.resolve(__dirname, 'node_modules'),
        ...(config.resolver?.nodeModulesPaths ?? []),
    ],
};

module.exports = withNativeWind(config, { input: './global.css' });
