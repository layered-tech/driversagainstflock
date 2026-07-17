const IS_PRODUCTION = process.env.APP_ENV === 'production';
const IS_STAGING = process.env.APP_ENV === 'staging';
const IS_E2E = process.env.APP_ENV === 'e2e';
const IS_DEV = !IS_PRODUCTION && !IS_STAGING && !IS_E2E;
const ENABLE_CARPLAY = ['1', 'true', 'yes'].includes(
  String(process.env.ENABLE_CARPLAY || '').toLowerCase(),
);

const environment = IS_E2E
  ? 'e2e'
  : IS_DEV
    ? 'development'
    : IS_STAGING
      ? 'staging'
      : 'production';
const sentryPluginConfig = {
  note: 'Use SENTRY_AUTH_TOKEN env to authenticate with Sentry.',
  url: process.env.SENTRY_URL || 'https://sentry.io/',
};
const autoPlayIconFont = './assets/auto-play/font_awesome.ttf';
const androidGoogleServicesFile =
  process.env.FIREBASE_ANDROID_GOOGLE_SERVICES_FILE ||
  './daf-firebase-google-services.json';
const iosGoogleServicesFile =
  process.env.FIREBASE_IOS_GOOGLE_SERVICES_FILE ||
  (IS_DEV || IS_E2E
    ? './dev-daf-firebase-GoogleService-Info.plist'
    : './daf-firebase-GoogleService-Info.plist');
const nativeFirebasePlugins = [
  '@react-native-firebase/app',
  [
    '@react-native-firebase/analytics',
    {
      ios: {
        withoutAdIdSupport: true,
      },
    },
  ],
];

if (process.env.SENTRY_ORG) {
  sentryPluginConfig.organization = process.env.SENTRY_ORG;
}

if (process.env.SENTRY_PROJECT) {
  sentryPluginConfig.project = process.env.SENTRY_PROJECT;
}

const shouldUseSentryBuildPlugin =
  (!IS_DEV && !IS_E2E) ||
  Boolean(
    process.env.SENTRY_AUTH_TOKEN ||
    process.env.SENTRY_ORG ||
    process.env.SENTRY_PROJECT,
  );

const name = IS_E2E
  ? 'Drivers Against Flock (E2E)'
  : IS_DEV
    ? 'Drivers Against Flock (Dev)'
    : IS_STAGING
      ? 'Drivers Against Flock (Staging)'
      : 'Drivers Against Flock';

const applicationId =
  IS_DEV || IS_E2E
    ? 'com.anonymous.drivefree.dev'
    : IS_STAGING
      ? 'com.anonymous.drivefree'
      : 'com.anonymous.drivefree';

module.exports = {
  name,
  slug: 'driversagainstflock',
  scheme: 'driversagainstflock',
  version: require('./package.json').version,
  orientation: 'portrait',
  icon: './assets/images/app-logo.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      MGLMapboxMetricsEnabledSettingShownInApp: true,
    },
    bundleIdentifier: applicationId,
    googleServicesFile: iosGoogleServicesFile,
    icon: {
      dark: './assets/images/logos/ios-icon-dark.png',
      light: './assets/images/logos/ios-icon-default.png',
      monochrome: './assets/images/logos/ios-icon-monochrome.png',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/logos/android-icon-foreground.png',
      backgroundImage: './assets/images/logos/android-icon-background.png',
      monochromeImage: './assets/images/logos/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    package: applicationId,
    googleServicesFile: androidGoogleServicesFile,
  },
  web: {
    favicon: './assets/images/app-logo.png',
  },
  plugins: [
    './plugins/withCocoaPodsHttp1',
    './plugins/withGradleJvmMemory',
    // Injects the React Native Firebase compatibility shims required by `useFrameworks: "dynamic"`
    // (below). No-op under static linking. See the plugin for details.
    './plugins/withDynamicFrameworksCompat',
    ...(ENABLE_CARPLAY ? ['./plugins/withCarPlayAutoPlay'] : []),
    [
      'expo-build-properties',
      {
        ios: {
          // MapboxMaps is a pure-Swift SPM package shared (via SPM) by @rnmapbox/maps and the
          // Navigation SDK. Under static linking it gets archived into every consuming pod, producing
          // thousands of duplicate symbols at the final link. Dynamic frameworks link it once — the
          // approach React Native's SPM integration recommends. Firebase/GoogleAppMeasurement ship as
          // static xcframeworks, so they are kept static within the dynamic setup (see the Podfile's
          // $RNFirebaseAsStaticFramework and GoogleUtilities modular_headers below).
          useFrameworks: 'dynamic',
          extraPods: [
            {
              name: 'GoogleUtilities',
              modular_headers: true,
            },
          ],
        },
      },
    ],
    'expo-router',
    'expo-system-ui',
    [
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontDefinitions: [
                {
                  path: autoPlayIconFont,
                  weight: 400,
                },
              ],
              fontFamily: 'font_awesome',
            },
          ],
        },
        ios: {
          fonts: [autoPlayIconFont],
        },
      },
    ],
    ...(shouldUseSentryBuildPlugin
      ? [['@sentry/react-native/expo', sentryPluginConfig]]
      : []),
    [
      'expo-navigation-bar',
      {
        barStyle: 'auto',
        enforceContrast: false,
      },
    ],
    'expo-web-browser',
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission:
          'Allow $(PRODUCT_NAME) to use your microphone for voice search.',
        speechRecognitionPermission:
          'Allow $(PRODUCT_NAME) to turn speech into location search text.',
      },
    ],
    [
      '@rnmapbox/maps',
      {
        // Bumped from 11.20.1 -> 11.20.2 so a single MapboxMaps is shared with the iOS
        // Navigation SDK (nav-ios 3.20.1 pins MapboxMaps 11.20.2). See mapbox-navigation plugin.
        RNMapboxMapsVersion: '11.20.2',
      },
    ],
    [
      './mapbox-navigation/app.plugin.js',
      {
        RNMapboxNavigationSdkVersion: '3.24.2',
        // iOS: MapboxNavigationCore is SPM-only; the plugin wires it (and MapboxMaps) into the
        // pod target via Swift Package Manager at these versions.
        RNMapboxNavigationIosSdkVersion: '3.20.1',
        RNMapboxMapsVersion: '11.20.2',
        // Enables continued map-matching while backgrounded (parity with the app's
        // `foregroundService: true` usage). Adds `UIBackgroundModes: ["location"]` on iOS so the
        // Navigation SDK may keep tracking; the module only turns on background tracking when this
        // mode is present, so CoreLocation cannot crash on a missing entitlement.
        iosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Allow $(PRODUCT_NAME) to use your precise location so the map can show where you are.',
      },
    ],
    ...nativeFirebasePlugins,
    [
      'expo-dev-client',
      {
        toolsButton: false,
      },
    ],
  ],
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: '213a980a-473d-4493-9d6f-5a9bd3abae14',
    },
    environment,
  },
  owner: 'jikon',
};
