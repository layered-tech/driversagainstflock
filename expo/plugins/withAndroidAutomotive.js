const {
    withAndroidManifest,
    withGradleProperties,
    withProjectBuildGradle,
} = require('expo/config-plugins');

const NAME = 'android:name';
const CAR_ACTIVITY = 'androidx.car.app.activity.CarAppActivity';

function applyAutomotiveManifest(androidManifest) {
    const manifest = androidManifest.manifest;
    manifest.$ ??= {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const application = manifest.application[0];
    const main = application.activity.find((activity) =>
        activity.$[NAME].endsWith('MainActivity'),
    );
    if (!main) throw new Error('Automotive setup requires MainActivity');
    main.$['android:exported'] = 'false';
    main.$['android:launchMode'] = 'singleTask';
    main['intent-filter'] = [{ $: { 'tools:node': 'removeAll' } }];
    main['meta-data'] = [
        { $: { [NAME]: 'distractionOptimized', 'tools:node': 'remove' } },
    ];
    application['meta-data'] = (application['meta-data'] ?? []).filter(
        (entry) => entry.$[NAME] !== 'daf.appTarget',
    );
    application['meta-data'].push({
        $: { [NAME]: 'daf.appTarget', 'android:value': 'automotive' },
    });
    application.activity = application.activity.filter(
        (activity) => activity.$[NAME] !== CAR_ACTIVITY,
    );
    application.activity.push({
        $: {
            [NAME]: CAR_ACTIVITY,
            'android:exported': 'true',
            'android:launchMode': 'singleTask',
            'android:theme': '@android:style/Theme.DeviceDefault.NoActionBar',
        },
        'intent-filter': [
            { $: { 'tools:node': 'removeAll' } },
            {
                action: [{ $: { [NAME]: 'android.intent.action.MAIN' } }],
                category: [
                    'android.intent.category.LAUNCHER',
                    'android.intent.category.APP_MAPS',
                ].map((name) => ({ $: { [NAME]: name } })),
            },
            ...[
                'androidx.car.app.action.NAVIGATE',
                'android.intent.action.VIEW',
            ].map((action) => ({
                action: [{ $: { [NAME]: action } }],
                category: [
                    { $: { [NAME]: 'android.intent.category.DEFAULT' } },
                ],
                data: [{ $: { 'android:scheme': 'geo' } }],
            })),
        ],
        'meta-data': [
            { $: { [NAME]: 'distractionOptimized', 'android:value': 'true' } },
        ],
    });
    const features = {
        'android.hardware.type.automotive': true,
        'android.software.car.templates_host': true,
        'android.hardware.camera': false,
        'android.hardware.camera.autofocus': false,
        'android.hardware.telephony': false,
        'android.hardware.location.gps': false,
        'android.hardware.screen.portrait': false,
        'android.hardware.screen.landscape': false,
    };
    manifest['uses-feature'] = (manifest['uses-feature'] ?? []).filter(
        (entry) => !(entry.$[NAME] in features),
    );
    for (const [name, required] of Object.entries(features)) {
        manifest['uses-feature'].push({
            $: { [NAME]: name, 'android:required': String(required) },
        });
    }
    // Auto Play declares optional vehicle telemetry; navigation uses device location only.
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
        (entry) => !entry.$[NAME].startsWith('android.car.permission.'),
    );
    for (const permission of [
        'CAR_ENERGY',
        'CAR_ENERGY_PORTS',
        'CAR_EXTERIOR_ENVIRONMENT',
        'CAR_IDENTIFICATION',
        'CAR_INFO',
        'CAR_POWERTRAIN',
        'CAR_SPEED',
    ]) {
        manifest['uses-permission'].push({
            $: {
                [NAME]: `android.car.permission.${permission}`,
                'tools:node': 'remove',
            },
        });
    }
    return androidManifest;
}

function applyAutomotiveGradleProperties(properties) {
    const existingMinSdk =
        Number(
            properties.find((entry) => entry.key === 'android.minSdkVersion')
                ?.value,
        ) || 0;
    const values = {
        'android.minSdkVersion': String(Math.max(29, existingMinSdk)),
        ReactNativeAutoPlay_isAutomotiveApp: 'true',
        ReactNativeAutoPlay_androidAutoAppCategory: 'navigation',
    };
    return [
        ...properties.filter((entry) => !(entry.key in values)),
        ...Object.entries(values).map(([key, value]) => ({
            type: 'property',
            key,
            value,
        })),
    ];
}

function applyAutomotiveBuildGradle(contents) {
    const marker = '// DAF Android Automotive SDK floor';
    if (contents.includes(marker)) return contents;
    return `${contents}\n${marker}\nrootProject.ext.minSdkVersion = Math.max(rootProject.ext.minSdkVersion as int, 29)\nrootProject.ext.isAutomotiveApp = "true"\nrootProject.ext.androidAutoAppCategory = "navigation"\n`;
}

function withAndroidAutomotive(config) {
    config = withAndroidManifest(config, (mod) => {
        mod.modResults = applyAutomotiveManifest(mod.modResults);
        return mod;
    });
    config = withGradleProperties(config, (mod) => {
        mod.modResults = applyAutomotiveGradleProperties(mod.modResults);
        return mod;
    });
    return withProjectBuildGradle(config, (mod) => {
        mod.modResults.contents = applyAutomotiveBuildGradle(
            mod.modResults.contents,
        );
        return mod;
    });
}
withAndroidAutomotive.__testables = {
    applyAutomotiveManifest,
    applyAutomotiveGradleProperties,
    applyAutomotiveBuildGradle,
};
module.exports = withAndroidAutomotive;
