import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

const hostLifecycleSource = readSource('../../android-auto-host-lifecycle.js');
const androidPlatformSource = readSource('../../auto-play-platform.android.js');
const iosPlatformSource = readSource('../../auto-play-platform.ios.js');
const moduleConfig = JSON.parse(
    readSource(
        '../../../modules/android-auto-host-lifecycle/expo-module.config.json',
    ),
);
const moduleGradleSource = readSource(
    '../../../modules/android-auto-host-lifecycle/android/build.gradle',
);
const hostLifecycleModuleSource = readSource(
    '../../../modules/android-auto-host-lifecycle/android/src/main/java/expo/modules/androidautohostlifecycle/AndroidAutoHostLifecycleModule.kt',
);

function loadHostLifecycle({ nativeModule, platformOS = 'android' }) {
    const requestedModuleNames = [];
    const module = { exports: {} };
    const transformedSource = transformSync(hostLifecycleSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        'expo-modules-core': {
            requireOptionalNativeModule(moduleName) {
                requestedModuleNames.push(moduleName);

                return nativeModule;
            },
        },
        'react-native': {
            Platform: { OS: platformOS },
        },
    };

    new Function('require', 'module', 'exports', transformedSource)(
        (specifier) => {
            if (!(specifier in mockedModules)) {
                throw new Error(`Unexpected module request: ${specifier}`);
            }

            return mockedModules[specifier];
        },
        module,
        module.exports,
    );

    return { hostLifecycle: module.exports, requestedModuleNames };
}

function createRecordingNativeModule({ rejectWith = null } = {}) {
    const calls = [];

    return {
        calls,
        async setCarSessionConnected(isConnected) {
            calls.push(isConnected);

            if (rejectWith) {
                throw rejectWith;
            }
        },
    };
}

async function flushPromises() {
    await new Promise((resolve) => setImmediate(resolve));
}

describe('Android Auto host lifecycle sync', () => {
    test('forwards connection changes once and skips repeated session states', () => {
        const nativeModule = createRecordingNativeModule();
        const { hostLifecycle } = loadHostLifecycle({ nativeModule });
        const sync =
            hostLifecycle.createAndroidAutoHostLifecycleSync(nativeModule);

        assert.equal(
            sync({ isConnected: true, renderState: 'willAppear' }),
            true,
        );
        assert.equal(
            sync({ isConnected: true, renderState: 'didAppear' }),
            false,
        );
        assert.equal(sync({ isConnected: false }), true);
        assert.equal(sync({ isConnected: false }), false);
        assert.equal(sync(null), false);
        assert.deepEqual(nativeModule.calls, [true, false]);
    });

    test('retries a connection state whose native call failed', async () => {
        const nativeModule = createRecordingNativeModule({
            rejectWith: new Error('host unavailable'),
        });
        const { hostLifecycle } = loadHostLifecycle({ nativeModule });
        const sync =
            hostLifecycle.createAndroidAutoHostLifecycleSync(nativeModule);

        assert.equal(sync({ isConnected: true }), true);
        await flushPromises();
        assert.equal(sync({ isConnected: true }), true);
        assert.deepEqual(nativeModule.calls, [true, true]);
    });

    test('is a no-op when the native module is unavailable', () => {
        const { hostLifecycle, requestedModuleNames } = loadHostLifecycle({
            nativeModule: null,
        });

        assert.deepEqual(requestedModuleNames, ['AndroidAutoHostLifecycle']);
        assert.equal(
            hostLifecycle.syncAndroidAutoHostLifecycle({ isConnected: true }),
            false,
        );
    });

    test('never looks up the native module on iOS', () => {
        const nativeModule = createRecordingNativeModule();
        const { hostLifecycle, requestedModuleNames } = loadHostLifecycle({
            nativeModule,
            platformOS: 'ios',
        });

        assert.deepEqual(requestedModuleNames, []);
        assert.equal(
            hostLifecycle.syncAndroidAutoHostLifecycle({ isConnected: true }),
            false,
        );
        assert.deepEqual(nativeModule.calls, []);
    });

    test('binds the default sync to the AndroidAutoHostLifecycle module', () => {
        const nativeModule = createRecordingNativeModule();
        const { hostLifecycle } = loadHostLifecycle({ nativeModule });

        assert.equal(
            hostLifecycle.syncAndroidAutoHostLifecycle({ isConnected: true }),
            true,
        );
        assert.deepEqual(nativeModule.calls, [true]);
    });

    test('registers the sync with the Android car session state only', () => {
        assert.match(
            androidPlatformSource,
            /registerPlatformListeners\(\{[\s\S]*?addAutoPlaySessionStateListener\(syncAndroidAutoHostLifecycle\);/,
        );
        assert.doesNotMatch(iosPlatformSource, /AndroidAutoHostLifecycle/);
    });
});

describe('Android Auto host lifecycle native module', () => {
    test('links only on Android', () => {
        assert.deepEqual(moduleConfig.platforms, ['android']);
        assert.deepEqual(moduleConfig.android.modules, [
            'expo.modules.androidautohostlifecycle.AndroidAutoHostLifecycleModule',
        ]);
        assert.equal(moduleConfig.apple, undefined);
        assert.match(moduleGradleSource, /useCoreDependencies\(\)/);
        assert.match(
            moduleGradleSource,
            /implementation 'com\.facebook\.react:react-android'/,
        );
    });

    test('exposes the connection switch on the main queue', () => {
        assert.match(
            hostLifecycleModuleSource,
            /Name\("AndroidAutoHostLifecycle"\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /AsyncFunction\("setCarSessionConnected"\) \{ isConnected: Boolean ->[\s\S]*?carSessionIsConnected = isConnected[\s\S]*?resumeHostForCarSession\(\)[\s\S]*?pauseHostAfterCarSession\(\)[\s\S]*?\}\.runOnQueue\(Queues\.MAIN\)/,
        );
    });

    test('observes the React host and the phone activity for the module lifetime', () => {
        assert.match(
            hostLifecycleModuleSource,
            /OnCreate \{[\s\S]*?addLifecycleEventListener\(hostLifecycleListener\)[\s\S]*?registerActivityLifecycleCallbacks\(activityLifecycleCallbacks\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /OnDestroy \{[\s\S]*?removeLifecycleEventListener\(hostLifecycleListener\)[\s\S]*?unregisterActivityLifecycleCallbacks\(activityLifecycleCallbacks\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /override fun onActivityPaused\(activity: Activity\) \{[\s\S]*?activity is ReactActivity[\s\S]*?hostActivityIsPaused = true/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /override fun onActivityResumed\(activity: Activity\) \{[\s\S]*?hostActivityIsPaused = false/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /override fun onActivityDestroyed\(activity: Activity\) \{[\s\S]*?hostActivityIsPaused = true[\s\S]*?scheduleHostResumeForCarSession\(\)/,
        );
    });

    test('resumes the host after React Native pauses it during a car session', () => {
        assert.match(
            hostLifecycleModuleSource,
            /override fun onHostPause\(\) \{[\s\S]*?if \(isApplyingHostLifecycle \|\| !carSessionIsConnected\)[\s\S]*?hostActivityIsPaused = true[\s\S]*?scheduleHostResumeForCarSession\(\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /private fun resumeHostForCarSession\(\) \{[\s\S]*?if \(!carSessionIsConnected \|\| !hostActivityIsPaused\)[\s\S]*?host\.lifecycleState == LifecycleState\.RESUMED[\s\S]*?host\.onHostResume\(activity, activity as\? DefaultHardwareBackBtnHandler\)/,
        );
    });

    test('supports cold car starts and activity destruction without opening the phone', () => {
        assert.match(
            hostLifecycleModuleSource,
            /hostActivityIsPaused = reactContext\.currentActivity == null \|\|/,
        );
        assert.doesNotMatch(
            hostLifecycleModuleSource,
            /currentActivity \?: return|startActivity|FLAG_TURN_SCREEN_ON|WakeLock/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /val activity = observedReactContext\?\.currentActivity\?\.takeUnless \{[\s\S]*?it\.isFinishing \|\| it\.isDestroyed/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /override fun onHostDestroy\(\) \{[\s\S]*?hostActivityIsPaused = true[\s\S]*?scheduleHostResumeForCarSession\(\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /UiThreadUtil\.runOnUiThread\(resumeHostRunnable\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /OnDestroy \{\s*carSessionIsConnected = false\s*UiThreadUtil\.removeOnUiThread\(resumeHostRunnable\)/,
        );
    });

    test('hands the paused activity back to React Native once the car disconnects', () => {
        assert.match(
            hostLifecycleModuleSource,
            /private fun pauseHostAfterCarSession\(\) \{[\s\S]*?if \(carSessionIsConnected \|\| !hostActivityIsPaused\)[\s\S]*?host\.lifecycleState != LifecycleState\.RESUMED[\s\S]*?host\.onHostPause\(activity\)[\s\S]*?host\.onHostPause\(\)/,
        );
        assert.match(
            hostLifecycleModuleSource,
            /private inline fun applyHostLifecycle[\s\S]*?isApplyingHostLifecycle = true[\s\S]*?finally \{[\s\S]*?isApplyingHostLifecycle = false/,
        );
    });
});
