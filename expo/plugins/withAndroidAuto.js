const { createRequire } = require('module');
const { instrumentClusterEnabled } = require('../car-display-config');

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

function applyAndroidAutoManifest(androidManifest) {
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

    if (!instrumentClusterEnabled) {
        androidManifest.manifest.$ ??= {};
        androidManifest.manifest.$['xmlns:tools'] =
            'http://schemas.android.com/tools';
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
                                  category.$?.[ANDROID_NAME] !==
                                  CLUSTER_CATEGORY,
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
                            [ANDROID_NAME]:
                                'androidx.car.app.category.NAVIGATION',
                        },
                    },
                ],
            });
        }
        // Intent filters do not merge by name. Replace the library's filters
        // so its FEATURE_CLUSTER declaration cannot survive manifest merging.
        carService['intent-filter'] = [
            { $: { 'tools:node': 'removeAll' } },
            ...filters,
        ];
    }

    return androidManifest;
}

function withAndroidAuto(config) {
    const { withAndroidManifest } = requireConfigPlugins();

    return withAndroidManifest(config, (manifestConfig) => {
        manifestConfig.modResults = applyAndroidAutoManifest(
            manifestConfig.modResults,
        );

        return manifestConfig;
    });
}

withAndroidAuto.__testables = {
    applyAndroidAutoManifest,
};

module.exports = withAndroidAuto;
