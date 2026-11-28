const { createRequire } = require('module');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { androidInstrumentClusterEnabled } = require('../car-display-config');

function requireConfigPlugins() {
    try {
        return require('expo/config-plugins');
    } catch {
        return createRequire(`${process.cwd()}/package.json`)(
            'expo/config-plugins',
        );
    }
}

const PLUGIN_NAME = 'with-android-auto';
const ANDROID_NAME = 'android:name';
const NAVIGATE_ACTION = 'androidx.car.app.action.NAVIGATE';
const VIEW_ACTION = 'android.intent.action.VIEW';
const CAR_SERVICE =
    'com.margelo.nitro.swe.iternio.reactnativeautoplay.AndroidAutoService';
const CAR_SERVICE_ACTION = 'androidx.car.app.CarAppService';
const CLUSTER_CATEGORY = 'androidx.car.app.category.FEATURE_CLUSTER';
const LOADER_METADATA = 'org.unimodules.core.AppLoader#react-native-headless';
const LOADER_PACKAGE = 'com.driversagainstflock.auto';
const LOADER_CLASS = 'CarHeadlessAppLoader';

// Expo releases its headless runtime when no phone Activity owns it. Its
// manifest loader hook lets this app include the bound car service as an owner.
async function writeCarHeadlessAppLoader(projectRoot, androidRoot) {
    const expoRequire = createRequire(
        require.resolve('expo/package.json', { paths: [projectRoot] }),
    );
    const core = path.dirname(
        expoRequire.resolve('expo-modules-core/package.json'),
    );
    const source = await readFile(
        path.join(
            core,
            'android/src/main/java/expo/modules/adapters/react/apploader/RNHeadlessAppLoader.kt',
        ),
        'utf8',
    );
    const replacements = [
        [
            'package expo.modules.adapters.react.apploader',
            `package ${LOADER_PACKAGE}\n\nimport ${CAR_SERVICE}`,
        ],
        ['class RNHeadlessAppLoader ', `class ${LOADER_CLASS} `],
        [
            'if (reactHost.lifecycleState == LifecycleState.BEFORE_CREATE)',
            'if (reactHost.lifecycleState == LifecycleState.BEFORE_CREATE && AndroidAutoService.instance == null)',
        ],
    ];
    let contents = source;
    for (const [original, replacement] of replacements) {
        if (!contents.includes(original))
            throw new Error(
                'Review the Android Auto headless loader against the installed Expo SDK.',
            );
        contents = contents.replace(original, replacement);
    }
    const directory = path.join(
        androidRoot,
        'app/src/main/java',
        ...LOADER_PACKAGE.split('.'),
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${LOADER_CLASS}.kt`), contents);
}

function getElementNames(elements) {
    return (Array.isArray(elements) ? elements : [])
        .map((element) => element?.$?.[ANDROID_NAME])
        .filter(Boolean);
}

function getIntentFilterActions(intentFilter) {
    return getElementNames(intentFilter?.action);
}

function isMainActivity(activity) {
    const activityName = activity?.$?.[ANDROID_NAME];

    return (
        activityName === '.MainActivity' ||
        activityName === 'MainActivity' ||
        activityName?.endsWith('.MainActivity')
    );
}

function makeGeoIntentFilter(actionName) {
    return {
        action: [{ $: { [ANDROID_NAME]: actionName } }],
        category: [
            { $: { [ANDROID_NAME]: 'android.intent.category.DEFAULT' } },
        ],
        data: [{ $: { 'android:scheme': 'geo' } }],
    };
}

function isGeoIntentFilterForAction(intentFilter, actionName) {
    return (
        getIntentFilterActions(intentFilter).includes(actionName) &&
        (intentFilter?.data ?? []).some(
            (data) => data?.$?.['android:scheme'] === 'geo',
        )
    );
}

function ensureMainActivityGeoIntentFilter(activity, actionName) {
    const intentFilters = Array.isArray(activity['intent-filter'])
        ? activity['intent-filter']
        : [];

    if (
        intentFilters.some((intentFilter) =>
            isGeoIntentFilterForAction(intentFilter, actionName),
        )
    ) {
        return;
    }

    activity['intent-filter'] = [
        ...intentFilters,
        makeGeoIntentFilter(actionName),
    ];
}

function removeMainActivityGeoIntentFilter(activity, actionName) {
    activity['intent-filter'] = (activity['intent-filter'] ?? []).filter(
        (intentFilter) => !isGeoIntentFilterForAction(intentFilter, actionName),
    );
}

function applyAndroidAutoManifest(
    androidManifest,
    { instrumentClusterEnabled = androidInstrumentClusterEnabled } = {},
) {
    const application = androidManifest?.manifest?.application?.[0];

    if (!application) {
        throw new Error(`${PLUGIN_NAME}: Android manifest has no application`);
    }

    const mainActivity = (application.activity ?? []).find(isMainActivity);

    if (!mainActivity) {
        throw new Error(`${PLUGIN_NAME}: could not find MainActivity`);
    }

    removeMainActivityGeoIntentFilter(mainActivity, NAVIGATE_ACTION);
    ensureMainActivityGeoIntentFilter(mainActivity, VIEW_ACTION);

    androidManifest.manifest.$ ??= {};
    androidManifest.manifest.$['xmlns:tools'] =
        'http://schemas.android.com/tools';
    application['meta-data'] = [
        ...(application['meta-data'] ?? []).filter(
            (entry) => entry.$?.[ANDROID_NAME] !== LOADER_METADATA,
        ),
        {
            $: {
                [ANDROID_NAME]: LOADER_METADATA,
                'android:value': `${LOADER_PACKAGE}.${LOADER_CLASS}`,
                'tools:replace': 'android:value',
            },
        },
    ];
    application.service ??= [];
    let carService = application.service.find(
        (service) => service.$?.[ANDROID_NAME] === CAR_SERVICE,
    );
    if (!carService) {
        carService = { $: { [ANDROID_NAME]: CAR_SERVICE } };
        application.service.push(carService);
    }
    const filters = (carService['intent-filter'] ?? [])
        .filter((filter) => filter.$?.['tools:node'] !== 'removeAll')
        .map((filter) => ({
            ...filter,
            ...(filter.category
                ? {
                      category: filter.category.filter(
                          (category) =>
                              category.$?.[ANDROID_NAME] !== CLUSTER_CATEGORY,
                      ),
                  }
                : {}),
        }));
    if (
        !filters.some((filter) =>
            getIntentFilterActions(filter).includes(CAR_SERVICE_ACTION),
        )
    ) {
        filters.push({
            action: [{ $: { [ANDROID_NAME]: CAR_SERVICE_ACTION } }],
            category: [
                {
                    $: {
                        [ANDROID_NAME]: 'androidx.car.app.category.NAVIGATION',
                    },
                },
            ],
        });
    }
    if (instrumentClusterEnabled) {
        for (const filter of filters) {
            if (getIntentFilterActions(filter).includes(CAR_SERVICE_ACTION)) {
                filter.category ??= [];
                filter.category.push({
                    $: { [ANDROID_NAME]: CLUSTER_CATEGORY },
                });
            }
        }
    }
    // Intent filters do not merge by name. Replace the library's filters
    // so cluster support stays in agreement with the app configuration.
    carService['intent-filter'] = [
        { $: { 'tools:node': 'removeAll' } },
        ...filters,
    ];

    return androidManifest;
}

function withAndroidAuto(config) {
    const { withAndroidManifest, withDangerousMod } = requireConfigPlugins();

    const manifest = withAndroidManifest(config, (manifestConfig) => {
        manifestConfig.modResults = applyAndroidAutoManifest(
            manifestConfig.modResults,
        );

        return manifestConfig;
    });
    return withDangerousMod(manifest, [
        'android',
        async (mod) => {
            await writeCarHeadlessAppLoader(
                mod.modRequest.projectRoot,
                mod.modRequest.platformProjectRoot,
            );
            return mod;
        },
    ]);
}

withAndroidAuto.__testables = {
    applyAndroidAutoManifest,
    writeCarHeadlessAppLoader,
};

module.exports = withAndroidAuto;
