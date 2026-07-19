import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const androidNavigationModuleSource = readFileSync(
    new URL(
        '../../../mapbox-navigation/android/src/main/java/com/rnmapbox/navigation/RNMapboxNavigationModule.kt',
        import.meta.url,
    ),
    'utf8',
);
const androidNavigationManifestSource = readFileSync(
    new URL(
        '../../../mapbox-navigation/android/src/main/AndroidManifest.xml',
        import.meta.url,
    ),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const androidAutoPlayPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
    'utf8',
);

describe('Android Auto Mapbox Navigation lifecycle', () => {
    test('keeps navigation attached while the car session is connected', () => {
        const handleAutoPlayConnectSource = autoPlaySource.slice(
            autoPlaySource.indexOf('async function handleAutoPlayConnect()'),
            autoPlaySource.indexOf('function handleAutoPlayDisconnect()'),
        );

        assert.match(
            androidNavigationModuleSource,
            /private class AndroidAutoSessionLifecycleOwner : LifecycleOwner/,
        );
        assert.match(
            androidNavigationModuleSource,
            /MapboxNavigationApp\.attach\(lifecycleOwner\)[\s\S]*lifecycleOwner\.create\(\)/,
        );
        assert.match(
            androidNavigationModuleSource,
            /private fun deactivateAndroidAutoLifecycle\(\): Boolean \{[\s\S]*lifecycleOwner\.disconnect\(\)[\s\S]*androidAutoLifecycleOwner = null/,
        );
        assert.match(
            androidNavigationModuleSource,
            /private val mainHandler = Handler\(Looper\.getMainLooper\(\)\)/,
        );
        assert.match(
            androidNavigationModuleSource,
            /OnDestroy \{\s+destroyOnMainThread\(\)\s+\}/,
        );
        assert.match(
            androidNavigationModuleSource,
            /private fun destroyOnMainThread\(\) \{\s+if \(Looper\.myLooper\(\) != Looper\.getMainLooper\(\)\) \{\s+mainHandler\.postAtFrontOfQueue \{ destroyOnMainThread\(\) \}\s+return\s+\}[\s\S]*deactivateAndroidAutoLifecycle\(\)/,
        );
        assert.doesNotMatch(
            androidNavigationModuleSource,
            /lifecycleOwner\.disconnect\(\)\s+MapboxNavigationApp\.detach\(lifecycleOwner\)/,
        );
        assert.match(
            autoPlaySource,
            /async function handleAutoPlayConnect\(\)[\s\S]*await activateAndroidAutoLifecycleAsync\(\)/,
        );
        const mapTemplateRegistrationIndex =
            handleAutoPlayConnectSource.indexOf(
                'const mapTemplate = new MapTemplate(',
            );
        const lifecycleActivationIndex = handleAutoPlayConnectSource.indexOf(
            'await activateAndroidAutoLifecycleAsync()',
        );

        assert.ok(mapTemplateRegistrationIndex >= 0);
        assert.ok(lifecycleActivationIndex >= 0);
        assert.ok(mapTemplateRegistrationIndex < lifecycleActivationIndex);
        assert.match(
            autoPlaySource,
            /function handleAutoPlayDisconnect\(\)[\s\S]*deactivateAndroidAutoLifecycleAsync\(\)/,
        );
        assert.match(
            autoPlaySource,
            /const connectionGeneration = \+\+autoPlayConnectionGeneration;[\s\S]*connectionGeneration !== autoPlayConnectionGeneration/,
        );
        assert.equal(
            handleAutoPlayConnectSource.match(
                /rootMapTemplate !== mapTemplate/g,
            )?.length,
            3,
        );
        assert.match(
            autoPlaySource,
            /function handleAutoPlayDisconnect\(\) \{\s+autoPlayConnectionGeneration \+= 1;/,
        );
        assert.match(
            androidAutoPlayPlatformSource,
            /addListenerRenderState\(\s*'AutoPlayRoot',\s*onSessionRenderState/,
        );
        assert.match(
            autoPlaySource,
            /let didConnectListenerIsRegistering = true;[\s\S]*addListener\('didConnect',[\s\S]*if \(didConnectListenerIsRegistering\)[\s\S]*didConnectListenerIsRegistering = false;[\s\S]*HybridAutoPlay\.isConnected\(\)/,
        );
        assert.match(
            androidNavigationModuleSource,
            /AUTO_PLAY_RENDER_STATE_DID_APPEAR -> resume\(\)[\s\S]*AUTO_PLAY_RENDER_STATE_WILL_DISAPPEAR -> moveToStarted\(\)[\s\S]*AUTO_PLAY_RENDER_STATE_DID_DISAPPEAR -> stop\(\)/,
        );
    });

    test('promotes an already-running trip session to a foreground service', () => {
        assert.match(
            androidNavigationModuleSource,
            /navigation\.isRunningForegroundService\(\)/,
        );
        assert.match(
            androidNavigationModuleSource,
            /navigation\.stopTripSession\(\)\s+navigation\.startTripSession\(withForegroundService = true\)/,
        );
    });

    test('does not use an app-owned CPU wake lock', () => {
        assert.doesNotMatch(
            androidNavigationModuleSource,
            /PowerManager|PARTIAL_WAKE_LOCK|NavigationWakeLock/,
        );
        assert.doesNotMatch(
            androidNavigationManifestSource,
            /android\.permission\.WAKE_LOCK/,
        );
        assert.doesNotMatch(autoPlaySource, /NavigationWakeLock|WAKE_LOCK/);
    });
});
