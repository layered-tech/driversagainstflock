import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const androidAutoServiceSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoService.kt',
        import.meta.url,
    ),
    'utf8',
);
const mapTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/MapTemplate.kt',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayPatch = readFileSync(
    new URL(
        '../../../patches/@iternio+react-native-auto-play+0.4.7.patch',
        import.meta.url,
    ),
    'utf8',
);
const androidAutoServicePatchStart = autoPlayPatch.indexOf(
    'diff --git a/node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoService.kt',
);
const androidAutoServicePatchEnd = autoPlayPatch.indexOf(
    '\ndiff --git ',
    androidAutoServicePatchStart + 1,
);
const androidAutoServicePatch = autoPlayPatch.slice(
    androidAutoServicePatchStart,
    androidAutoServicePatchEnd,
);
const mapTemplatePatchStart = autoPlayPatch.indexOf(
    'diff --git a/node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/MapTemplate.kt',
);
const mapTemplatePatchEnd = autoPlayPatch.indexOf(
    '\ndiff --git ',
    mapTemplatePatchStart + 1,
);
const mapTemplatePatch = autoPlayPatch.slice(
    mapTemplatePatchStart,
    mapTemplatePatchEnd,
);

const rootSessionBranch = androidAutoServiceSource.match(
    /override fun onCreateSession[\s\S]*?if \(sessionInfo\.displayType == SessionInfo\.DISPLAY_TYPE_CLUSTER\) \{[\s\S]*?return session[\s\S]*?\}[\s\S]*?session\.lifecycle\.addObserver\(sessionLifecycleObserver\)/,
);
const sessionLifecycleObserver = androidAutoServiceSource.match(
    /private val sessionLifecycleObserver[\s\S]*?private val connection/,
);

test('Android Auto assigns foreground location to the root car session', () => {
    assert.ok(rootSessionBranch);
    assert.ok(sessionLifecycleObserver);
    assert.match(
        sessionLifecycleObserver[0],
        /override fun onCreate[\s\S]*?this@AndroidAutoService\.startForeground\(\)[\s\S]*?bindService/,
    );
    assert.match(
        sessionLifecycleObserver[0],
        /override fun onDestroy[\s\S]*?unbindService[\s\S]*?this@AndroidAutoService\.stopForeground\(STOP_FOREGROUND_REMOVE\)/,
    );
    assert.equal(
        androidAutoServiceSource.match(
            /stopForeground\(STOP_FOREGROUND_REMOVE\)/g,
        )?.length,
        2,
    );
    assert.match(
        androidAutoServiceSource,
        /override fun onDestroy\(\)[\s\S]*?stopForeground\(STOP_FOREGROUND_REMOVE\)/,
    );
});

test('navigation start retries foreground after late permission without owning teardown', () => {
    assert.match(
        mapTemplateSource,
        /fun startNavigation[\s\S]*?AndroidAutoService\.instance\?\.startForeground\(\)/,
    );
    assert.doesNotMatch(
        mapTemplateSource,
        /AndroidAutoService\.instance\?\.stopForeground/,
    );
});

test('phone Activity teardown cannot stop an active Android Auto session', () => {
    assert.doesNotMatch(androidAutoServiceSource, /LifecycleEventListener/);
    assert.doesNotMatch(androidAutoServiceSource, /onHostDestroy/);
    assert.doesNotMatch(androidAutoServiceSource, /stopSelf\(\)/);
});

test('Android Auto holds a CPU-only wake lock for the root car session', () => {
    assert.match(
        sessionLifecycleObserver[0],
        /override fun onCreate[\s\S]*?acquireSessionWakeLock\(\)/,
    );
    assert.match(
        sessionLifecycleObserver[0],
        /override fun onDestroy[\s\S]*?releaseSessionWakeLock\(\)/,
    );
    assert.match(
        androidAutoServiceSource,
        /newWakeLock\([\s\S]*?PowerManager\.PARTIAL_WAKE_LOCK/,
    );
    assert.doesNotMatch(
        androidAutoServiceSource,
        /SCREEN_(?:BRIGHT|DIM)_WAKE_LOCK|FULL_WAKE_LOCK|ON_AFTER_RELEASE/,
    );
    assert.match(
        androidAutoServiceSource,
        /override fun onDestroy\(\)[\s\S]*?releaseSessionWakeLock\(\)/,
    );
});

test('Android Auto avoids reposting an unchanged foreground notification', () => {
    assert.match(
        androidAutoServiceSource,
        /fun notify\(title: String\?, text: String\?, icon: Bitmap\?\)[\s\S]*?notificationContentMatches\(title, text, icon\)[\s\S]*?return/,
    );
    assert.match(
        androidAutoServiceSource,
        /private fun notificationContentMatches[\s\S]*?title != lastNotificationTitle[\s\S]*?text != lastNotificationText/,
    );
    assert.match(
        androidAutoServiceSource,
        /startForeground\([\s\S]*?rememberNotificationContent\(null, null, null\)/,
    );
});

test('the tracked AutoPlay patch preserves car-session foreground ownership', () => {
    assert.notEqual(androidAutoServicePatchStart, -1);
    assert.notEqual(mapTemplatePatchStart, -1);
    assert.match(
        androidAutoServicePatch,
        /\+\s*this@AndroidAutoService\.startForeground\(\)/,
    );
    assert.match(androidAutoServicePatch, /-\s*override fun onHostDestroy\(\)/);
    assert.match(androidAutoServicePatch, /-\s*stopSelf\(\)/);
    assert.doesNotMatch(
        mapTemplatePatch,
        /-\s*AndroidAutoService\.instance\?\.startForeground\(\)/,
    );
    assert.match(
        mapTemplatePatch,
        /-\s*AndroidAutoService\.instance\?\.stopForeground\(Service\.STOP_FOREGROUND_REMOVE\)/,
    );
    assert.match(
        androidAutoServicePatch,
        /\+.*PowerManager\.PARTIAL_WAKE_LOCK/,
    );
    assert.doesNotMatch(
        androidAutoServicePatch,
        /\+.*SCREEN_(?:BRIGHT|DIM)_WAKE_LOCK|\+.*FULL_WAKE_LOCK/,
    );
});
