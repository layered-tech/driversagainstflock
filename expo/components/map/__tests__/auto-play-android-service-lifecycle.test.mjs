import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );

const androidAutoServiceSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoService.kt',
    ),
    'utf8',
);
const mapTemplateSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/MapTemplate.kt',
    ),
    'utf8',
);
const navigationManagerCoordinatorSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/NavigationManagerCoordinator.kt',
    ),
    'utf8',
);
const headlessTaskServiceSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HeadlessTaskService.kt',
    ),
    'utf8',
);
const hybridAutoPlaySource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridAutoPlay.kt',
    ),
    'utf8',
);
const hybridClusterSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridCluster.kt',
    ),
    'utf8',
);
const headlessJsTaskSource = readFileSync(
    join(autoPlayPackageRoot, 'src/AutoPlayHeadlessJsTask.ts'),
    'utf8',
);
const clusterSceneSource = readFileSync(
    join(autoPlayPackageRoot, 'src/scenes/AutoPlayCluster.ts'),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const automotiveManifestSource = readFileSync(
    join(autoPlayPackageRoot, 'android/src/automotive/AndroidManifest.xml'),
    'utf8',
);
const nonNavigationAutomotiveManifestSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/automotive/AndroidManifest-nonnav.xml',
    ),
    'utf8',
);

const sessionLifecycleObserver = androidAutoServiceSource.match(
    /private val sessionLifecycleObserver[\s\S]*?private val connection/,
);

test('Android Auto ref-counts foreground and headless ownership across every car session', () => {
    assert.ok(sessionLifecycleObserver);
    assert.match(
        androidAutoServiceSource,
        /override fun onCreateSession[\s\S]*?session\.lifecycle\.addObserver\(sessionLifecycleObserver\)[\s\S]*?return session/,
    );
    assert.doesNotMatch(
        androidAutoServiceSource,
        /displayType == SessionInfo\.DISPLAY_TYPE_CLUSTER[\s\S]*?return session/,
    );
    assert.match(
        sessionLifecycleObserver[0],
        /override fun onCreate[\s\S]*?activeSessionOwners\.add\(owner\)[\s\S]*?activeSessionOwners\.size == 1[\s\S]*?startForeground\(\)[\s\S]*?bindingAccepted = try[\s\S]*?bindService/,
    );
    assert.match(
        sessionLifecycleObserver[0],
        /override fun onDestroy[\s\S]*?activeSessionOwners\.remove\(owner\)[\s\S]*?activeSessionOwners\.isEmpty\(\)[\s\S]*?finishCarRuntime\(\)/,
    );
    assert.match(
        androidAutoServiceSource,
        /private fun finishCarRuntime\(\)[\s\S]*?MapTemplate\.navigationEnded\(\)[\s\S]*?notifyAllCarSessionsDisconnected\(\)[\s\S]*?releaseHeadlessServiceBinding\(\)[\s\S]*?stopForeground\(STOP_FOREGROUND_REMOVE\)/,
    );
    assert.match(
        androidAutoServiceSource,
        /headlessServiceBindingAccepted = bindingAccepted[\s\S]*?val shouldUnbind[\s\S]*?headlessServiceBindingAccepted = false[\s\S]*?unbindService\(connection\)/,
    );
});

test('the headless JS task ends only after the final native car session', () => {
    assert.match(
        hybridAutoPlaySource,
        /isCarServiceRunning\(\)[\s\S]*?AndroidAutoService\.instance\?\.hasActiveSessions\(\) == true/,
    );
    assert.match(
        headlessTaskServiceSource,
        /emitAllCarSessionsDisconnected[\s\S]*?ALL_CAR_SESSIONS_DISCONNECTED_EVENT/,
    );
    assert.match(
        headlessTaskServiceSource,
        /fun notifyAllCarSessionsDisconnected\(\)[\s\S]*?instance\?\.emitAllCarSessionsDisconnected\(\)/,
    );
    assert.match(
        headlessJsTaskSource,
        /DeviceEventEmitter\.addListener\([\s\S]*?ALL_CAR_SESSIONS_DISCONNECTED_EVENT[\s\S]*?finishIfCarRuntimeStopped/,
    );
    assert.match(
        headlessJsTaskSource,
        /if \(isFinished \|\| hybridAutoPlay\.isCarServiceRunning\(\)\)/,
    );
    assert.doesNotMatch(headlessJsTaskSource, /addListener\('didDisconnect'/);
});

test('root teardown preserves navigation until the last cluster disconnects', () => {
    assert.match(
        clusterSceneSource,
        /hasConnectedSessions\(\)[\s\S]*?Object\.keys\(this\.clusters\)\.length > 0/,
    );
    assert.match(
        clusterSceneSource,
        /addConnectionStateListener[\s\S]*?connectionStateListeners\.add\(callback\)[\s\S]*?callback\(this\.hasConnectedSessions\(\)\)[\s\S]*?connectionStateListeners\.delete\(callback\)/,
    );
    assert.match(
        hybridClusterSource,
        /eventType == ClusterEventName\.DIDCONNECTWITHWINDOW[\s\S]*?AndroidAutoSession\.getClusterSessions\(\)[\s\S]*?queuedClusterIds \+ connectedClusterIds/,
    );
    assert.match(
        autoPlaySource,
        /function handleAutoPlayDisconnect[\s\S]*?clusterIsConnected[\s\S]*?AutoPlayCluster\.hasConnectedSessions\?\.\(\)[\s\S]*?setAutoPlaySessionConnected\(Boolean\(clusterIsConnected\)\)[\s\S]*?rootMapTemplate = null[\s\S]*?autoPlayNavigationRuntimeIsClusterOwned = true[\s\S]*?return[\s\S]*?clearAutoPlayNavigationRuntime\(\)/,
    );
    assert.match(
        autoPlaySource,
        /handleAutoPlayClusterConnectionStateChanged[\s\S]*?!isConnected && autoPlayNavigationRuntimeIsClusterOwned[\s\S]*?clearAutoPlayNavigationRuntime\(\)/,
    );
    assert.match(
        autoPlaySource,
        /AutoPlayCluster\.addConnectionStateListener\?\.\([\s\S]*?handleAutoPlayClusterConnectionStateChanged/,
    );
    assert.match(
        autoPlaySource,
        /handleAutoPlayClusterConnectionStateChanged[\s\S]*?clusterConnectionGeneration[\s\S]*?hydrateSharedRoutingStateAsync\(\)[\s\S]*?clusterConnectionGeneration !==[\s\S]*?autoPlayClusterConnectionGeneration[\s\S]*?rootMapTemplate[\s\S]*?!AutoPlayCluster\.hasConnectedSessions\?\.\(\)[\s\S]*?syncAutoPlayNavigationFromSharedRoutingState\(routingState\)/,
    );
    assert.match(
        autoPlaySource,
        /handleAutoPlayClusterConnectionStateChanged[\s\S]*?setAutoPlaySessionConnected\(Boolean\(rootMapTemplate \|\| isConnected\)\)/,
    );
    assert.match(
        autoPlaySource,
        /function startClusterOwnedAutoPlayNavigation[\s\S]*?autoPlayNavigationRuntimeIsClusterOwned = true[\s\S]*?AutoPlayCluster\.startNavigation\(makeTripConfig\(route\)\)[\s\S]*?updateNavigationGuidance\(null\)[\s\S]*?startNavigationLocationUpdates\(route\)/,
    );
    assert.match(
        autoPlaySource,
        /function updateNavigationGuidance[\s\S]*?nativeNavigationTemplate[\s\S]*?autoPlayNavigationRuntimeIsClusterOwned[\s\S]*?nativeNavigationTemplate\.updateTravelEstimates[\s\S]*?nativeNavigationTemplate\.updateManeuvers[\s\S]*?autoPlayArrivalDetector\.recordLocation/,
    );
    assert.match(
        autoPlaySource,
        /function reattachClusterOwnedNavigationToRoot[\s\S]*?hostNavigationAlreadyStarted[\s\S]*?startAutoPlayNavigation\(route/,
    );
    assert.match(
        mapTemplateSource,
        /NavigationManagerCoordinator\.startNavigation\(createDestinationTrip\(\)\)[\s\S]*?NavigationManagerCoordinator\.updateTrip\(trip\)/,
    );
    assert.match(
        navigationManagerCoordinatorSource,
        /fun registerSession[\s\S]*?setNavigationManagerCallback[\s\S]*?sessionManagers\[sessionId\] = sessionManager/,
    );
    assert.match(
        navigationManagerCoordinatorSource,
        /fun unregisterSession[\s\S]*?ownerSessionId = null[\s\S]*?selectOwnerIfNeeded\(\)[\s\S]*?replayNavigationOnOwner/,
    );
    assert.match(
        clusterSceneSource,
        /setNavigationCallbacks[\s\S]*?startNavigation[\s\S]*?updateTravelEstimates[\s\S]*?updateManeuvers[\s\S]*?stopNavigation/,
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

test('Android Auto relies on its foreground and bound service lifecycle', () => {
    assert.doesNotMatch(
        androidAutoServiceSource,
        /PowerManager|WakeLock|newWakeLock|acquireSessionWakeLock|releaseSessionWakeLock/,
    );
    assert.doesNotMatch(
        automotiveManifestSource,
        /android\.permission\.WAKE_LOCK/,
    );
});

test('Android Automotive routes geo navigation and search through its car activity', () => {
    const automotiveService = automotiveManifestSource.match(
        /<service[\s\S]*?AndroidAutoService[\s\S]*?<\/service>/,
    );

    assert.ok(automotiveService);
    assert.doesNotMatch(
        automotiveService[0],
        /androidx\.car\.app\.action\.NAVIGATE|android:scheme="geo"/,
    );
    assert.equal(
        automotiveManifestSource.match(
            /android:name="androidx\.car\.app\.action\.NAVIGATE"/g,
        )?.length,
        1,
    );
    assert.equal(
        automotiveManifestSource.match(
            /android:name="android\.intent\.action\.VIEW"/g,
        )?.length,
        1,
    );
    assert.equal(
        nonNavigationAutomotiveManifestSource.match(
            /android:name="android\.intent\.action\.VIEW"/g,
        )?.length ?? 0,
        0,
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
    assert.match(
        androidAutoServiceSource,
        /val hasNavigationContent[\s\S]*?NotificationCompat\.CATEGORY_NAVIGATION[\s\S]*?NotificationCompat\.CATEGORY_SERVICE[\s\S]*?if \(hasNavigationContent\) \{[\s\S]*?CarAppExtender\.Builder/,
    );
    assert.match(
        androidAutoServiceSource,
        /setPriority\(NotificationCompat\.PRIORITY_LOW\)/,
    );
    assert.match(
        androidAutoServiceSource,
        /carNotificationManager = CarNotificationManager\.from\(this\)/,
    );
    assert.match(
        androidAutoServiceSource,
        /BuildConfig\.IS_NAVIGATION_APP[\s\S]*?carNotificationManager\.notify\(NOTIFICATION_ID, notificationBuilder\)[\s\S]*?notificationManager\.notify\(NOTIFICATION_ID, notificationBuilder\.build\(\)\)/,
    );
});

test('navigation end replaces stale turn content with the neutral session notification', () => {
    assert.match(
        androidAutoServiceSource,
        /fun clearNavigationNotification\(\) \{\s*clearNotificationContent\(\)\s*notify\(null, null, null\)\s*\}/,
    );
    assert.match(
        androidAutoServiceSource,
        /private fun clearNotificationContent\(\)[\s\S]*?hasNotificationContent = false[\s\S]*?lastNotificationTitle = null[\s\S]*?lastNotificationText = null[\s\S]*?lastNotificationIcon = null/,
    );
    assert.match(
        mapTemplateSource,
        /fun navigationEnded\(\)[\s\S]*?clearNavigationPresentation\(\)[\s\S]*?private fun clearNavigationPresentation\(\)[\s\S]*?AndroidAutoService\.instance\?\.clearNavigationNotification\(\)[\s\S]*?AndroidAutoScreen\.invalidateSurfaceScreens\(\)/,
    );
});
