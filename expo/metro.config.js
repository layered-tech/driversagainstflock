const path = require('path');
const { withNativeWind } = require('nativewind/metro');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
const linkedMapboxNavigationPackage = path.resolve(
  __dirname,
  './mapbox-navigation',
);

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), linkedMapboxNavigationPackage]),
);
config.resolver = {
  ...(config.resolver ?? {}),
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
    ...(config.resolver?.nodeModulesPaths ?? []),
  ],
};

module.exports = withNativeWind(config, { input: './global.css' });
