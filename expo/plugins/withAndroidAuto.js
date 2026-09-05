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

const PLUGIN_NAME = 'with-android-auto';
const ANDROID_NAME = 'android:name';
const NAVIGATE_ACTION = 'androidx.car.app.action.NAVIGATE';
const VIEW_ACTION = 'android.intent.action.VIEW';

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
        (intentFilter) =>
            !isGeoIntentFilterForAction(intentFilter, actionName),
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
