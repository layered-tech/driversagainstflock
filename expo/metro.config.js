const path = require('path');
const { withNativeWind } = require('nativewind/metro');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver = {
    ...(config.resolver ?? {}),
    nodeModulesPaths: [
        path.resolve(__dirname, 'node_modules'),
        ...(config.resolver?.nodeModulesPaths ?? []),
    ],
};

module.exports = withNativeWind(config, { input: './global.css' });
