import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveAppTarget } = require('../../app-target.js');
const {
    applyAutomotiveManifest,
    applyAutomotiveGradleProperties,
    applyAutomotiveBuildGradle,
} = require('../../plugins/withAndroidAutomotive.js').__testables;
const { applyAndroidAutoManifest } =
    require('../../plugins/withAndroidAuto.js').__testables;
const name = 'android:name';
function manifest() {
    return {
        manifest: {
            application: [
                {
                    activity: [
                        {
                            $: {
                                [name]: '.MainActivity',
                                'android:exported': 'true',
                            },
                            'intent-filter': [
                                {
                                    action: [
                                        {
                                            $: {
                                                [name]: 'android.intent.action.VIEW',
                                            },
                                        },
                                    ],
                                    data: [
                                        {
                                            $: {
                                                'android:scheme':
                                                    'driversagainstflock',
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    };
}

test('target defaults to mobile and rejects accidental target names', () => {
    assert.equal(resolveAppTarget(), 'mobile');
    assert.equal(resolveAppTarget('automotive'), 'automotive');
    assert.throws(() => resolveAppTarget('android-auto'), /Unsupported/);
});

test('native Android target cannot be overridden by the connected Metro manifest', () => {
    const { transformSync } = require('@babel/core');
    const source = transformSync(
        readFileSync(
            new URL('../../lib/app-target.js', import.meta.url),
            'utf8',
        ),
        {
            configFile: false,
            babelrc: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    ).code;
    const config = (appTarget) => ({ extra: { appTarget } });
    for (const [platform, embedded, metroTarget, expected] of [
        [
            'android',
            JSON.stringify(config('automotive')),
            'mobile',
            'automotive',
        ],
        ['android', config('automotive'), 'mobile', 'automotive'],
        ['android', JSON.stringify(config('mobile')), 'automotive', 'mobile'],
        ['android', '{}', 'automotive', 'mobile'],
        ['android', 'invalid json', 'automotive', 'mobile'],
        ['android', undefined, 'automotive', 'automotive'],
        ['ios', config('automotive'), 'mobile', 'mobile'],
        ['web', undefined, 'mobile', 'mobile'],
    ]) {
        const module = { exports: {} };
        vm.runInNewContext(source, {
            module,
            exports: module.exports,
            require(id) {
                if (id === 'expo-constants')
                    return {
                        __esModule: true,
                        default: { expoConfig: config(metroTarget) },
                    };
                if (id === 'react-native')
                    return { Platform: { OS: platform } };
                if (id === 'expo')
                    return {
                        requireOptionalNativeModule: (name) => {
                            assert.equal(name, 'ExponentConstants');
                            return { manifest: embedded };
                        },
                    };
                throw new Error(id);
            },
        });
        assert.equal(
            module.exports.APP_TARGET,
            expected,
            `${platform}: ${embedded}`,
        );
        assert.equal(
            module.exports.IS_AUTOMOTIVE,
            platform === 'android' && expected === 'automotive',
        );
    }
});

test('Automotive manifest has one launcher and private parked setup without mobile links', () => {
    const result = applyAutomotiveManifest(
        applyAndroidAutoManifest(manifest()),
    );
    const app = result.manifest.application[0];
    const setup = app.activity.find(
        (activity) => activity.$[name] === '.MainActivity',
    );
    assert.equal(setup.$['android:exported'], 'false');
    assert.deepEqual(setup['intent-filter'], [
        { $: { 'tools:node': 'removeAll' } },
    ]);
    assert.equal(setup['meta-data'][0].$['tools:node'], 'remove');
    const launchers = app.activity.filter((activity) =>
        JSON.stringify(activity['intent-filter']).includes(
            'android.intent.category.LAUNCHER',
        ),
    );
    assert.equal(launchers.length, 1);
    assert.equal(
        launchers[0].$[name],
        'androidx.car.app.activity.CarAppActivity',
    );
    assert.match(
        JSON.stringify(launchers[0]),
        /androidx.car.app.action.NAVIGATE/,
    );
    assert.doesNotMatch(JSON.stringify(result), /driversagainstflock/);
    assert.match(JSON.stringify(app.service), /NAVIGATION/);
    assert.match(JSON.stringify(app.service), /FEATURE_CLUSTER/);
    assert.ok(
        result.manifest['uses-feature'].some(
            (entry) =>
                entry.$[name] === 'android.hardware.type.automotive' &&
                entry.$['android:required'] === 'true',
        ),
    );
    const serialized = JSON.stringify(result);
    assert.equal(JSON.stringify(applyAutomotiveManifest(result)), serialized);
});

test('Automotive configuration selects package source set without lowering SDK versions', () => {
    const properties = applyAutomotiveGradleProperties([
        {
            type: 'property',
            key: 'ReactNativeAutoPlay_isAutomotiveApp',
            value: 'false',
        },
        { type: 'property', key: 'android.minSdkVersion', value: '32' },
    ]);
    assert.equal(
        properties.find(
            (entry) => entry.key === 'ReactNativeAutoPlay_isAutomotiveApp',
        ).value,
        'true',
    );
    assert.equal(
        properties.find((entry) => entry.key === 'android.minSdkVersion').value,
        '32',
    );
    assert.deepEqual(applyAutomotiveGradleProperties(properties), properties);
    const gradle = applyAutomotiveBuildGradle(
        'apply plugin: "expo-root-project"\n',
    );
    assert.match(
        gradle,
        /Math.max\(rootProject.ext.minSdkVersion as int, 29\)/,
    );
    assert.equal(applyAutomotiveBuildGradle(gradle), gradle);
});

test('app config and profiles keep environments, package, and Automotive artifacts separate', () => {
    const configPath = require.resolve('../../app.config.js');
    const original = {
        target: process.env.APP_TARGET,
        env: process.env.APP_ENV,
    };
    try {
        for (const target of ['mobile', 'automotive']) {
            process.env.APP_TARGET = target;
            process.env.APP_ENV = 'production';
            delete require.cache[configPath];
            const config = require(configPath);
            assert.equal(config.extra.appTarget, target);
            assert.equal(config.android.package, 'com.anonymous.drivefree');
            assert.equal(
                config.plugins.includes('./plugins/withAndroidAutomotive'),
                target === 'automotive',
            );
        }
    } finally {
        for (const [key, value] of [
            ['APP_TARGET', original.target],
            ['APP_ENV', original.env],
        ]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        delete require.cache[configPath];
    }
    const eas = require('../../eas.json');
    const pkg = require('../../package.json');
    for (const target of ['development', 'e2e', 'staging', 'production']) {
        const profile = eas.build[`automotive-${target}`];
        assert.equal(profile.env.APP_TARGET, 'automotive');
        assert.equal(
            profile.android.buildType,
            target === 'production' ? 'app-bundle' : 'apk',
        );
        assert.match(
            pkg.scripts[`build:automotive:${target}`],
            /scripts\/eas-local-build.sh/,
        );
        assert.doesNotMatch(
            pkg.scripts[`build:automotive:${target}`],
            /--submit|auto-submit/,
        );
    }
});

test('Automotive boots shared services without router or watch initialization', () => {
    const { transformSync } = require('@babel/core');
    const source = transformSync(
        readFileSync(new URL('../../index.js', import.meta.url), 'utf8'),
        {
            configFile: false,
            babelrc: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    ).code;
    for (const automotive of [true, false]) {
        const events = [];
        vm.runInNewContext(source, {
            require(id) {
                if (id === 'react-native')
                    return {
                        AppRegistry: {
                            registerComponent: (name) =>
                                events.push(`register:${name}`),
                        },
                        LogBox: { ignoreLogs() {} },
                    };
                if (id === './lib/app-target')
                    return { IS_AUTOMOTIVE: automotive };
                if (id === './components/auto-play')
                    return {
                        __esModule: true,
                        default: () => events.push('auto-play'),
                    };
                if (id.endsWith('scorecard-runtime-instance'))
                    return {
                        initializeScorecardRuntime: () =>
                            events.push('scorecard'),
                    };
                if (id.endsWith('watch-runtime'))
                    return {
                        initializeWatchRuntime: () => events.push('watch'),
                    };
                if (id.endsWith('saved-locations'))
                    return {
                        loadSearchSavedLocations: () => {
                            events.push('saved');
                            return Promise.resolve();
                        },
                    };
                if (id.endsWith('alpr-presence-runtime'))
                    return {
                        startPresenceRuntime: () => events.push('presence'),
                    };
                if (id === 'expo-router/entry') events.push('router');
                return {};
            },
        });
        assert.ok(
            events.includes('auto-play') &&
                events.includes('scorecard') &&
                events.includes('presence') &&
                events.includes('saved'),
        );
        assert.equal(events.includes('router'), !automotive);
        assert.equal(events.includes('watch'), !automotive);
        assert.equal(events.includes('register:main'), automotive);
    }
});

test('Android Auto manifest plugin cannot reintroduce mobile links after Automotive setup', () => {
    const result = applyAndroidAutoManifest(
        applyAutomotiveManifest(manifest()),
        { isAutomotive: true },
    );
    const main = result.manifest.application[0].activity.find(
        (activity) => activity.$[name] === '.MainActivity',
    );
    assert.deepEqual(main['intent-filter'], [
        { $: { 'tools:node': 'removeAll' } },
    ]);
    assert.equal(main.$['android:exported'], 'false');
});

test('release metadata targets the dedicated Automotive track and records captured screens', () => {
    const release = require('../../automotive-release.json');
    assert.equal(release.trackType, 'Android Automotive OS only');
    assert.equal(release.buildProfile, 'automotive-production');
    assert.ok(release.shortDescription.length <= 80);
    assert.equal(release.screenshots.status, 'captured_on_automotive_emulator');
    for (const orientation of ['portrait', 'landscape', 'ultrawide']) {
        const screenshots = release.screenshots[orientation];
        assert.equal(screenshots.files.length, screenshots.count);
        assert.ok(screenshots.files.every((file) => file.endsWith('.png')));
    }
    assert.ok(
        release.releaseGates.includes(
            'Physical vehicle acceptance before broad rollout',
        ),
    );
});

test('Automotive network errors provide recovery instructions and preserve location errors', () => {
    const source = readFileSync(
        new URL('../../components/auto-play.js', import.meta.url),
        'utf8',
    );
    const errorFunction = source.slice(
        source.indexOf('function showAutoPlayError('),
        source.indexOf('\nfunction autoPlayVoiceRequestIsCurrent('),
    );
    const networkError =
        'fetch failed: java.net.UnknownHostException: Unable to resolve host "example.test"';
    for (const automotive of [true, false]) {
        for (const message of [
            networkError,
            'Location is turned off. Open Car setup.',
        ]) {
            let template, state;
            const showError = vm.runInNewContext(
                errorFunction + '\nshowAutoPlayError;',
                {
                    loadAutoPlayModule: () => ({}),
                    handleRootHeaderSearchPress() {},
                    makeAutoText: (value) => value,
                    getBackHeaderAction: () => ({}),
                    autoPlayPlatform: {
                        isAutomotive: automotive,
                        createErrorTemplate: (config) => {
                            template = config;
                            return { push: async () => {} };
                        },
                    },
                    setAutoPlayState: (value) => {
                        state = value;
                    },
                },
            );
            showError('Search unavailable', message);
            const expected =
                automotive && message === networkError
                    ? "Check your car's internet connection, then try Search again."
                    : message;
            assert.equal(template.message, expected);
            assert.equal(state.errorText, expected);
        }
    }
});

test('Automotive adapter uses car permissions and exposes a valid setup recovery action', async () => {
    const source = readFileSync(
        new URL(
            '../../components/auto-play-platform.android.js',
            import.meta.url,
        ),
        'utf8',
    );
    for (const automotive of [true, false]) {
        const requests = [];
        let opened = 0;
        const adapter = vm.runInNewContext(
            source
                .slice(source.indexOf('export const autoPlayPlatform'))
                .replace('export const autoPlayPlatform =', 'const adapter =') +
                '\nadapter;',
            {
                IS_AUTOMOTIVE: automotive,
                AndroidAutoMapSurface() {},
                openAutomotiveSetup: async () => opened++,
                automotiveLocationPermissions: {
                    ensure: async (options) => {
                        requests.push(options);
                        return { ready: true };
                    },
                },
            },
        );
        await adapter.prepareSession();
        await adapter.ensureLocation();
        assert.equal(requests.length, automotive ? 2 : 0);
        const error = adapter.createErrorTemplate({
            autoPlayModule: {
                InformationTemplate: class {
                    constructor(config) {
                        this.config = config;
                    }
                },
            },
            searchAction: { type: 'text', title: 'Search' },
        });
        assert.equal(error.config.actions.android.length, automotive ? 2 : 1);
        if (automotive) {
            const setup = error.config.actions.android[1];
            assert.equal(setup.type, 'text');
            assert.equal(setup.title, 'Car setup');
            setup.onPress();
            assert.equal(opened, 1);
        }
    }
});

test('Automotive keeps virtual-renderer gesture scaling and uses unmodified host ornament insets', () => {
    const source = readFileSync(
        new URL(
            '../../components/android-auto-map-surface.js',
            import.meta.url,
        ),
        'utf8',
    );
    for (const automotive of [true, false]) {
        const config = vm.runInNewContext(
            source
                .slice(
                    source.indexOf(
                        'const ANDROID_AUTO_SURFACE_PLATFORM_CONFIG',
                    ),
                )
                .replace(
                    'export const AndroidAutoMapSurface =',
                    'const surface =',
                ) + '\nsurface;',
            {
                IS_AUTOMOTIVE: automotive,
                createAutoPlayMapSurface: (config) => config,
            },
        );
        assert.equal(config.applyWindowScaleToMapGestures, true);
        assert.equal(config.ornamentSafeAreaLeftScale, automotive ? 1 : 0.65);
    }
});

test('Automotive E2E builds load staging map and API configuration', () => {
    const pkg = require('../../package.json');
    assert.match(pkg.scripts['build:automotive:e2e'], /APP_ENV=e2e/);
    assert.match(pkg.scripts['build:automotive:e2e'], /dotenv -c staging --/);
});

test('Automotive SDK floor reaches Expo version catalogs before project plugins run', () => {
    const properties = applyAutomotiveGradleProperties([]);
    assert.equal(
        properties.find((entry) => entry.key === 'android.minSdkVersion').value,
        '29',
    );
    assert.equal(
        applyAutomotiveGradleProperties([
            { type: 'property', key: 'android.minSdkVersion', value: '35' },
        ]).find((entry) => entry.key === 'android.minSdkVersion').value,
        '35',
    );
});

test('Back to map clears stale car templates before closing setup, including host failure', async () => {
    const { transformSync } = require('@babel/core');
    const source = transformSync(
        readFileSync(
            new URL('../../components/automotive/native.js', import.meta.url),
            'utf8',
        ),
        {
            configFile: false,
            babelrc: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    ).code;
    for (const fail of [false, true]) {
        const calls = [];
        const module = { exports: {} };
        vm.runInNewContext(source, {
            module,
            exports: module.exports,
            require(id) {
                if (id === 'expo')
                    return {
                        requireNativeModule: () => ({
                            finishSetup: async () => calls.push('finish'),
                        }),
                    };
                if (id === '@iternio/react-native-auto-play')
                    return {
                        HybridAutoPlay: {
                            popToRootTemplate: async () => {
                                calls.push('map');
                                if (fail) throw new Error('host disconnected');
                            },
                        },
                    };
                throw new Error(id);
            },
        });
        if (fail)
            await assert.rejects(
                module.exports.finishAutomotiveSetup(),
                /host disconnected/,
            );
        else await module.exports.finishAutomotiveSetup();
        assert.deepEqual(calls, ['map', 'finish']);
    }
});

test('Automotive launch patch forwards cold intents and buffers them until JS subscribes', () => {
    const { patchSession, patchBridge } =
        require('../../plugins/withAutomotiveLaunchIntent.js').__testables;
    const root = new URL(
        '../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/',
        import.meta.url,
    );
    const session = patchSession(
        readFileSync(new URL('AndroidAutoSession.kt', root), 'utf8'),
    );
    const bridge = patchBridge(
        readFileSync(new URL('HybridAutoPlay.kt', root), 'utf8'),
    );
    assert.match(
        session,
        /clusterId == null && carContext.packageManager.hasSystemFeature\("android.hardware.type.automotive"\)[\s\S]*?onNewIntent\(intent\)/,
    );
    assert.match(
        session,
        /isAutomotiveNavigation && action == Intent.ACTION_VIEW && intent.data\?\.scheme == "geo"/,
    );
    assert.match(
        session,
        /if \(isAutomotiveNavigation\) parseCoordinates\(schemeSpecificPart.substringBefore\('\?'\)\) else null/,
    );
    assert.match(
        session,
        /else if \(isAutomotiveNavigation && location != null\) \{\s*null/,
    );
    assert.match(bridge, /pendingVoiceInput = Pair\(location, query\)/);
    assert.match(
        bridge,
        /pendingVoiceInput = null\s+callback\(pending.first, pending.second\)/,
    );
    assert.equal(patchSession(session), session);
    assert.equal(patchBridge(bridge), bridge);
    assert.throws(
        () => patchSession('unsupported source'),
        /no longer matches/,
    );
    assert.throws(() => patchBridge('unsupported source'), /no longer matches/);
});
