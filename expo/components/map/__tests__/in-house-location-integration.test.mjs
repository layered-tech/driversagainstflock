import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const appConfigSource = readSource('../../../app.config.js');
const autoPlayMapSurfaceSource = readSource(
    '../../auto-play-map-surface-content.js',
);
const autoPlaySource = readSource('../../auto-play.js');
const backgroundAlertRefreshSource = readSource(
    '../background-alert-refresh.js',
);
const drivingLocationProviderSource = readSource(
    '../driving-location-provider.js',
);
const durableAlertStoreSource = readSource('../durable-alert-store.js');
const easJson = JSON.parse(readSource('../../../eas.json'));
const electronicHorizonAlprStoreSource = readSource(
    '../electronic-horizon-alpr-store.js',
);
const indexSource = readSource('../../../index.js');
const locationDebugOverlaySource = readSource('../location-debug-overlay.js');
const locationPuck3DSource = readSource('../location-puck-3d.js');
const locationPuckProviderLifecycleSource = readSource(
    '../location-puck-provider-lifecycle.js',
);
const locationPuckPresentationSource = readSource(
    '../location-puck-presentation.js',
);
const mapCanvasSource = readSource('../map-canvas.js');
const mapScreenSource = readSource('../../map-screen.js');
const mapLocationControllerSource = readSource(
    '../use-map-location-controller.js',
);
const nativePuckProofSource = readSource('../native-puck-proof.js');
const nativePuckStateSource = readSource('../native-puck-state.js');
const roadMatchingE2EProbeSource = readSource('../road-matching-e2e-probe.js');
const useDeviceLocationSource = readSource('../use-device-location.js');
const mapLocationPuckModuleConfig = JSON.parse(
    readSource('../../../modules/map-location-puck/expo-module.config.json'),
);
const mapLocationPuckAndroidSource = readSource(
    '../../../modules/map-location-puck/android/src/main/java/expo/modules/maplocationpuck/MapLocationPuckModule.kt',
);
const mapLocationPuckIOSSource = readSource(
    '../../../modules/map-location-puck/ios/MapLocationPuckModule.swift',
);
const mapLocationPuckPodspecSource = readSource(
    '../../../modules/map-location-puck/ios/DAFMapLocationPuck.podspec',
);
const packageJson = JSON.parse(readSource('../../../package.json'));
const roadMatchingSessionSource = readSource('../road-matching-session.js');
const upcomingAlertsSource = readSource(
    '../use-upcoming-electronic-horizon-alerts.js',
);
const wazePoliceAlertsSource = readSource('../use-waze-police-alerts.js');
const wazePoliceAlertStoreSource = readSource('../waze-police-alert-store.js');

describe('in-house road-matched location integration', () => {
    test('does not package or invoke the removed Mapbox Navigation SDK', () => {
        const dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };
        const runtimeSource = [
            appConfigSource,
            autoPlayMapSurfaceSource,
            autoPlaySource,
            locationDebugOverlaySource,
            mapCanvasSource,
            mapLocationControllerSource,
            roadMatchingSessionSource,
        ].join('\n');

        assert.equal(dependencies['@rnmapbox/navigation'], undefined);
        assert.doesNotMatch(runtimeSource, /@rnmapbox\/navigation/);
        assert.doesNotMatch(runtimeSource, /mapbox-navigation-bridge/);
        assert.doesNotMatch(
            runtimeSource,
            /\.(?:startTripSession|startFreeDrive)\s*\(/,
        );
        assert.doesNotMatch(
            runtimeSource,
            /applyNavigationPuck3D|attachNavigationCamera/,
        );
        assert.doesNotMatch(
            [
                mapLocationPuckAndroidSource,
                mapLocationPuckIOSSource,
                mapLocationPuckPodspecSource,
            ].join('\n'),
            /com\.mapbox\.navigation|MapboxNavigationCore|MapboxNavigationProvider|navigationcore:/,
        );
    });

    test('feeds matched coordinates through one native provider and Maps 3D puck', () => {
        assert.match(
            drivingLocationProviderSource,
            /isLocationPuckLocationProviderSupported\(\)[\s\S]*?providerLifecycle\.request\(/,
        );
        assert.match(
            drivingLocationProviderSource,
            /getLocationPuckPresentationLocation\(userLocation\)[\s\S]*?userLocation: presentationLocation/,
        );
        assert.match(
            locationPuckPresentationSource,
            /roadMatch\?\.isOffRoad !== false[\s\S]*?LOCATION_PUCK_PREDICTION_MAXIMUM_DISTANCE_METERS/,
        );
        assert.match(
            drivingLocationProviderSource,
            /onStatusChange: setNativeProviderStatus[\s\S]*?nativeProviderStatus !== 'fallback'[\s\S]*?<Mapbox\.CustomLocationProvider/,
        );
        assert.match(
            locationPuckProviderLifecycleSource,
            /mapViewChanged[\s\S]*?clearMapView\(previousMapView\)[\s\S]*?updateLocationPuck\(request\.mapView, request\.location\)/,
        );
        assert.match(
            locationPuckProviderLifecycleSource,
            /setStatus\('recovering'\)[\s\S]*?clearMapView\(request\.mapView\)[\s\S]*?setStatus\('fallback'\)/,
        );
        assert.match(
            drivingLocationProviderSource,
            /const heading = isMoving[\s\S]*?courseHeading \?\? compassHeading[\s\S]*?compassHeading \?\? courseHeading/,
        );
        assert.match(
            drivingLocationProviderSource,
            /const recordedAt = getFiniteNumber\(location\?\.recordedAt\)/,
        );
        assert.match(mapCanvasSource, /<MapLocationProvider/);
        assert.match(mapCanvasSource, /<Mapbox\.LocationPuck/);
        assert.match(mapCanvasSource, /isLocationPuck3DSupported/);
        assert.match(mapCanvasSource, /createLocationPuck3DLifecycle/);
        assert.match(mapCanvasSource, /locationPuckRequests3D/);
        assert.match(
            mapCanvasSource,
            /!locationPuck2DFallbackIsSuppressed[\s\S]*?<Mapbox\.LocationPuck/,
        );
        assert.match(
            mapCanvasSource,
            /bearingImage=\{[\s\S]*?navigationPuckBearingImage/,
        );
        assert.match(
            mapCanvasSource,
            /createLocationPuckCameraFollowLifecycle/,
        );
        assert.match(mapCanvasSource, /requestLocationPuckCameraFollow/);
        assert.match(
            mapCanvasSource,
            /locationPuckNativeProviderIsReady[\s\S]*?locationPuckRequests3D/,
        );
        assert.match(
            mapCanvasSource,
            /onNativeProviderStatusChange=\{[\s\S]*?setLocationPuckProviderStatus/,
        );
        assert.match(
            mapCanvasSource,
            /locationPuckNativeCameraMayOwnViewport = \[[\s\S]*?'activating'[\s\S]*?'clearing'[\s\S]*?nativeLocationPuckCameraControllerIsEligible[\s\S]*?!locationPuckProviderUsesFallback \|\|[\s\S]*?locationPuckNativeCameraMayOwnViewport/,
        );
        assert.doesNotMatch(mapCanvasSource, /androidFollowCameraStop/);
        assert.match(
            mapScreenSource,
            /<RoadMatchingE2EProbe[\s\S]*?mapViewRef=\{locationController\.mapViewRef\}/,
        );
        assert.match(roadMatchingE2EProbeSource, /queryNativePuckState/);
        assert.match(
            roadMatchingE2EProbeSource,
            /nativePuckStateProves3DSnapping/,
        );
        assert.match(roadMatchingE2EProbeSource, /e2e-native-puck-proof/);
        assert.match(roadMatchingE2EProbeSource, /e2e-native-3d-puck-proof/);
        assert.match(
            nativePuckProofSource,
            /getLocationProviderCoordinateAsync/,
        );
        assert.match(
            nativePuckProofSource,
            /getLocationIndicatorCoordinateAsync/,
        );
        assert.match(
            nativePuckProofSource,
            /isLocationPuckRenderedAtCoordinateAsync/,
        );
        assert.match(
            nativePuckStateSource,
            /providerAtSnappedCoordinate === true[\s\S]*?providerAtRawCoordinate === false[\s\S]*?indicatorAtSnappedCoordinate === true[\s\S]*?indicatorAtRawCoordinate === false/,
        );
        assert.match(
            nativePuckStateSource,
            /puckKind === '3d'[\s\S]*?modelLayerExists === true[\s\S]*?modelSourceExists === true[\s\S]*?renderedAtSnappedCoordinate === true/,
        );
        assert.deepEqual(mapLocationPuckModuleConfig.platforms, [
            'android',
            'apple',
        ]);
        assert.deepEqual(mapLocationPuckModuleConfig.android.modules, [
            'expo.modules.maplocationpuck.MapLocationPuckModule',
        ]);
        assert.deepEqual(mapLocationPuckModuleConfig.apple.modules, [
            'MapLocationPuckModule',
        ]);
        assert.match(locationPuck3DSource, /MapLocationPuck/);
        assert.match(locationPuck3DSource, /setLocationPuckLocationAsync/);
        assert.match(
            locationPuck3DSource,
            /clearLocationPuckLocationProviderAsync/,
        );
        assert.match(locationPuck3DSource, /setLocationPuckCameraFollowAsync/);
        assert.match(mapLocationPuckAndroidSource, /LocationPuck3D\(/);
        assert.match(
            mapLocationPuckAndroidSource,
            /modelScaleMode = ModelScaleMode\.MAP/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /asset:\/\/navigation_puck\.glb/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /getLocationProviderCoordinate/,
        );
        assert.match(mapLocationPuckAndroidSource, /getIndicatorCoordinate/);
        assert.match(
            mapLocationPuckAndroidSource,
            /getLocationProvider\(\)\.registerLocationConsumer|locationProvider\.registerLocationConsumer/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /addOnIndicatorPositionChangedListener/,
        );
        assert.match(mapLocationPuckAndroidSource, /isLocatedAt\(/);
        assert.doesNotMatch(
            mapLocationPuckAndroidSource,
            /showNativeUserLocation/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /class SharedLocationPuckProvider : LocationProvider/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /setLocationPuckLocation[\s\S]*?ensureLocationProviderForUpdate\(mapView\)[\s\S]*?provider\.update/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /consumer\.onLocationUpdated\(point,[\s\S]*?consumer\.onBearingUpdated\(bearing,/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /clearLocationPuckLocationProvider[\s\S]*?state\.previousProvider/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /mapbox-location-model-layer/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /setLocationPuckCameraFollow[\s\S]*?makeFollowPuckViewportState/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /setLocationPuckCameraFollow[\s\S]*?reassertLiveLocationProvider\(mapView\)[\s\S]*?return@Coroutine false/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /isLocationPuckCameraFollowActive[\s\S]*?liveLocationProviderIsOwned/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /FollowPuckViewportStateBearing\.SyncWithLocationPuck/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /withTimeoutOrNull[\s\S]*?suspendCancellableCoroutine[\s\S]*?viewport\.transitionTo\([\s\S]*?viewport\.makeImmediateViewportTransition\(\)[\s\S]*?CompletionListener[\s\S]*?continuation\.isActive/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /viewportOwnsCameraFollowState[\s\S]*?is ViewportStatus\.State[\s\S]*?is ViewportStatus\.Transition/,
        );
        assert.match(mapLocationPuckIOSSource, /Puck3DConfiguration\(/);
        assert.match(
            mapLocationPuckIOSSource,
            /modelScaleMode: \.constant\(\.map\)/,
        );
        assert.match(mapLocationPuckIOSSource, /import MapboxMaps/);
        assert.match(
            mapLocationPuckIOSSource,
            /class OwnedLocationProviderState[\s\S]*?LocationDataModel\(/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /setLocationPuckLocation[\s\S]*?providerState\.update\([\s\S]*?location: location,[\s\S]*?heading: headingValue,[\s\S]*?recordedAt: normalizedRecordedAt/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /clearLocationPuckLocationProvider[\s\S]*?previousDataModel/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /setLocationPuckCameraFollow[\s\S]*?makeFollowPuckViewportState/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /setLocationPuckCameraFollow[\s\S]*?reassertLiveLocationProvider\(on: mapView\)/,
        );
        assert.match(mapLocationPuckIOSSource, /options\.bearing = \.heading/);
        assert.match(
            mapLocationPuckIOSSource,
            /transitionImmediately[\s\S]*?withCheckedContinuation[\s\S]*?makeImmediateViewportTransition\(\)[\s\S]*?DispatchQueue\.main\.asyncAfter/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /viewportOwnsCameraFollowState[\s\S]*?case \.state[\s\S]*?case \.transition/,
        );
        assert.match(mapLocationPuckPodspecSource, /dependency 'MapboxMaps'/);
        assert.match(
            roadMatchingE2EProbeSource,
            /style=\{\{ bottom: safeAreaInsets\.bottom \+ 4 \}\}/,
        );
        assert.doesNotMatch(
            roadMatchingE2EProbeSource,
            /NATIVE_PUCK_PROOF_TIMEOUT_MS/,
        );
    });

    test('keeps native puck ownership monotonic through replacement and cleanup', () => {
        assert.match(
            mapLocationPuckIOSSource,
            /private\(set\) var previousDataModel: LocationDataModel/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /func reassertOwnership\(on locationManager: LocationManager\)[\s\S]*?previousDataModel = locationManager\.dataModel[\s\S]*?locationManager\.dataModel = dataModel/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /private\(set\) var latestRecordedAt: Double\?[\s\S]*?recordedAt < latestRecordedAt[\s\S]*?return[\s\S]*?latestRecordedAt = recordedAt \?\? latestRecordedAt/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /providerState\.reassertOwnership\(on: locationManager\)[\s\S]*?providerState\.update\(/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /locationManager\.dataModel === providerState\.dataModel[\s\S]*?locationManager\.dataModel = providerState\.previousDataModel/,
        );

        const clearLocationPuck3DStart = mapLocationPuckAndroidSource.indexOf(
            'AsyncFunction("clearLocationPuck3D")',
        );
        const clearLocationPuck3DEnd = mapLocationPuckAndroidSource.indexOf(
            'AsyncFunction("setLocationPuckCameraFollow")',
            clearLocationPuck3DStart,
        );

        assert.notEqual(clearLocationPuck3DStart, -1);
        assert.notEqual(clearLocationPuck3DEnd, -1);

        const clearLocationPuck3DSource = mapLocationPuckAndroidSource.slice(
            clearLocationPuck3DStart,
            clearLocationPuck3DEnd,
        );

        assert.match(
            clearLocationPuck3DSource,
            /if \(hadLocationPuck3D\)[\s\S]*?location\.locationPuck = LocationPuck2D\(opacity = 0f\)/,
        );
        assert.doesNotMatch(
            clearLocationPuck3DSource,
            /location\.enabled = false|setLocationProvider|viewport\.idle|cameraFollowStates\.remove/,
        );
    });

    test('uses one shared Expo source for road matching and look-ahead', () => {
        assert.match(
            roadMatchingSessionSource,
            /TaskManager\.defineTask\([\s\S]*?publishRawLocationAsync/,
        );
        assert.match(
            roadMatchingSessionSource,
            /Location\.startLocationUpdatesAsync\(/,
        );
        assert.match(
            roadMatchingSessionSource,
            /stopForegroundLocationSubscription\(\)[\s\S]*?startBackgroundLocationTask/,
        );
        assert.match(indexSource, /map\/road-matching-session/);
        assert.equal(
            packageJson.dependencies['expo-task-manager']?.startsWith('~55.'),
            true,
        );
        assert.match(roadMatchingSessionSource, /createRoadMatcher/);
        assert.match(roadMatchingSessionSource, /createRoadMatcherWithHistory/);
        const corridorRadiusMeters = Number(
            roadMatchingSessionSource.match(
                /ROAD_CORRIDOR_RADIUS_METERS = (\d+)/,
            )?.[1],
        );
        const corridorRefreshDistanceMeters = Number(
            roadMatchingSessionSource.match(
                /ROAD_CORRIDOR_REFRESH_DISTANCE_METERS = (\d+)/,
            )?.[1],
        );
        const lookAheadDistanceMeters = Number(
            roadMatchingSessionSource.match(
                /ROAD_LOOK_AHEAD_DISTANCE_METERS = (\d+)/,
            )?.[1],
        );

        assert.equal(corridorRadiusMeters, 3200);
        assert.equal(corridorRefreshDistanceMeters, 1200);
        assert.ok(
            corridorRadiusMeters >=
                corridorRefreshDistanceMeters + lookAheadDistanceMeters,
        );
        assert.match(
            roadMatchingSessionSource,
            /getRoadCorridor\(\{[\s\S]*?radiusMeters: ROAD_CORRIDOR_RADIUS_METERS[\s\S]*?createDirectedRoadGraph\(ways\)[\s\S]*?createRoadMatcherWithHistory/,
        );
        assert.match(
            roadMatchingSessionSource,
            /rawLocationHistory\.slice\(0, -1\)/,
        );
        assert.match(roadMatchingSessionSource, /predictRoadLookAhead/);
        assert.match(
            mapLocationControllerSource,
            /useRoadMatchedLocationWatch\(\{[\s\S]*?persistent: isDrivingMode/,
        );
        assert.match(
            autoPlayMapSurfaceSource,
            /useRoadMatchedLocationWatch\(\{[\s\S]*?persistent: true/,
        );
        for (const locationConsumerSource of [
            mapLocationControllerSource,
            autoPlayMapSurfaceSource,
        ]) {
            assert.match(
                locationConsumerSource,
                /shouldAcceptLocationUpdate\(\{[\s\S]*?roadMatchedLocationWatchEnabledRef\.current/,
            );
            assert.match(
                locationConsumerSource,
                /useCurrentLocation\(\{[\s\S]*?roadMatchedLocationWatchEnabledRef/,
            );
            assert.match(
                locationConsumerSource,
                /useLayoutEffect\(\(\) => \{[\s\S]*?roadMatchedLocationWatchEnabledRef\.current\s*=\s*roadMatchedLocationWatchEnabled/,
            );
        }
        assert.match(
            useDeviceLocationSource,
            /getCurrentPositionForActiveLocationSource\(\{[\s\S]*?getLastRoadMatchedLocationAsync[\s\S]*?roadMatchedLocationWatchEnabledRef/,
        );
        assert.match(
            useDeviceLocationSource,
            /const nextLocation = getLocationUpdate\(position\)[\s\S]*?const currentLocation = \{[\s\S]*?if \(!isRoadMatchedLocationUpdate\(position\)\) \{[\s\S]*?setUserLocation\(currentLocation\);[\s\S]*?return currentLocation;/,
        );
        assert.match(
            useDeviceLocationSource,
            /const handleUserLocationUpdateRef = useRef\(handleUserLocationUpdate\);/,
        );
        assert.match(
            useDeviceLocationSource,
            /handleUserLocationUpdateRef\.current\?\.\(location\)/,
        );
        assert.match(
            useDeviceLocationSource,
            /\}, \[\s*enabled,\s*handleUserLocationUpdateIsAvailable,\s*isMountedRef,\s*persistent,\s*\]\);/,
        );
        assert.doesNotMatch(
            useDeviceLocationSource,
            /\}, \[\s*enabled,\s*handleUserLocationUpdate,\s*isMountedRef,\s*persistent,\s*\]\);/,
        );
        assert.match(
            appConfigSource,
            /isAndroidForegroundServiceEnabled: true/,
        );
        assert.match(
            appConfigSource,
            /isAndroidBackgroundLocationEnabled: false/,
        );
        assert.doesNotMatch(
            appConfigSource,
            /android\.permission\.ACCESS_BACKGROUND_LOCATION/,
        );
        assert.match(appConfigSource, /isIosBackgroundLocationEnabled: true/);
        assert.match(
            appConfigSource,
            /android\.permission\.RECEIVE_BOOT_COMPLETED/,
        );
        assert.match(
            roadMatchingSessionSource,
            /Location\.getBackgroundPermissionsAsync\(\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /Location\.requestBackgroundPermissionsAsync\(\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /if \(Platform\.OS !== 'ios'\) \{\s*return true;\s*\}/,
        );
        assert.match(roadMatchingSessionSource, /Platform\.OS === 'android'/);
        assert.match(roadMatchingSessionSource, /foregroundService:/);
        assert.match(
            roadMatchingSessionSource,
            /async function stopBackgroundLocationTask\(\{ force = false \} = \{\}\)[\s\S]*?hasStartedLocationUpdatesAsync/,
        );
        assert.match(
            roadMatchingSessionSource,
            /stopBackgroundLocationTask\(\{ force: true \}\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /setSessionStateToObservingIfAwaitingLocation/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /RNMapboxNavigation|retiredNavigationModule|startTripSession/,
        );
        assert.equal(easJson.build['e2e-test'].environment, 'development');
        assert.equal(easJson.build['e2e-test'].android.buildType, 'apk');
    });

    test('refreshes alert sources from the newest background delivery without a mounted view', () => {
        for (const alertSource of [
            upcomingAlertsSource,
            wazePoliceAlertsSource,
        ]) {
            assert.match(
                alertSource,
                /usePersistentRoadMatchingWatchIsActive\(\)/,
            );
            assert.match(alertSource, /shouldRefreshLocationData\(/);
        }

        assert.match(
            roadMatchingSessionSource,
            /latestLocation = locations\.at\(-1\)[\s\S]*?locationPublication = publishRawLocationAsync\([\s\S]*?latestLocation[\s\S]*?alertRefresh = runBackgroundLocationWorkAsync\(latestLocation\)[\s\S]*?Promise\.allSettled\(\[locationPublication, alertRefresh\]\)/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /for \(const location of locations\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /BACKGROUND_LOCATION_TASK_DEADLINE_MS = 24000[\s\S]*?settleBackgroundWorkWithinDeadlineAsync\([\s\S]*?processBackgroundLocationTaskAsync\(data\)[\s\S]*?BACKGROUND_LOCATION_TASK_DEADLINE_MS/,
        );
        assert.match(
            roadMatchingSessionSource,
            /async function runBackgroundLocationWorkAsync[\s\S]*?location: lastRoadMatchedLocation[\s\S]*?roadLookAhead: lastRoadLookAhead[\s\S]*?await refreshBackgroundAlertsForLocationAsync\(context\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /ROAD_CORRIDOR_REQUEST_TIMEOUT_MS = 23000[\s\S]*?BACKGROUND_LOCATION_TASK_DEADLINE_MS = 24000[\s\S]*?requestTimeoutId = setTimeout\([\s\S]*?requestAbortController\.abort\(\)[\s\S]*?ROAD_CORRIDOR_REQUEST_TIMEOUT_MS[\s\S]*?clearTimeout\(requestTimeoutId\)/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /BACKGROUND_ROAD_CORRIDOR_REQUEST_TIMEOUT_MS/,
        );
        assert.match(
            roadMatchingSessionSource,
            /lastGraphRequestFailure\?\.source === source[\s\S]*?requestContext = Object\.freeze\(\{[\s\S]*?originSource: source[\s\S]*?startedWithRoadGraph: roadGraph !== null[\s\S]*?error\?\.name !== 'AbortError' \|\| requestTimedOut[\s\S]*?source: requestContext\.originSource[\s\S]*?if \(!requestContext\.startedWithRoadGraph\) \{[\s\S]*?setSessionState\('road-graph-error'\)/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /async function publishRawLocationAsync[\s\S]*?runBackgroundLocationWorkAsync\(location\)[\s\S]*?function roadGraphNeedsRefresh/,
        );
        assert.doesNotMatch(
            [
                roadMatchingSessionSource,
                upcomingAlertsSource,
                wazePoliceAlertsSource,
            ].join('\n'),
            /addRoadMatchingBackgroundLocationWorkListener/,
        );

        assert.match(
            upcomingAlertsSource,
            /alertPathStateRef\.current = \{ coordinates, pathStateKey \}/,
        );
        assert.match(
            upcomingAlertsSource,
            /return refreshElectronicHorizonAlprNodesIfStale\(\{/,
        );
        assert.match(
            upcomingAlertsSource,
            /coordinatePathStateKey[\s\S]*?refreshAlprNodesIfStale/,
        );
        assert.match(
            wazePoliceAlertsSource,
            /centerRef\.current = currentCenter/,
        );
        assert.match(
            wazePoliceAlertsSource,
            /return refreshWazePoliceAlertsIfStale\(center\)/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /await getSharedRoutingStateForBackgroundAsync\(\)[\s\S]*?drivingModeIsActive[\s\S]*?getSelectedDirectionsRouteOption[\s\S]*?getDirectionsRouteCoordinatesAhead/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /pathSource === 'route'[\s\S]*?activeRouteCoordinates[\s\S]*?: electronicHorizonCoordinates/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /context\?\.location\?\.coords[\s\S]*?context\?\.rawLocation\?\.coords/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /getElectronicHorizonPrimaryCoordinates\([\s\S]*?context\?\.roadLookAhead[\s\S]*?\)/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /getSharedMapPreferencesState\(\)[\s\S]*?mapPreferencesAreLoaded[\s\S]*?storedPoliceAlertsAreEnabledPromise[\s\S]*?AsyncStorage\.getItem/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /refreshElectronicHorizonAlprNodesIfStale[\s\S]*?refreshWazePoliceAlertsIfStale[\s\S]*?Promise\.allSettled\(work\)/,
        );

        for (const alertStoreSource of [
            electronicHorizonAlprStoreSource,
            wazePoliceAlertStoreSource,
        ]) {
            assert.match(alertStoreSource, /AsyncStorage/);
            assert.match(alertStoreSource, /createDurableAlertStore\(\{/);
            assert.match(alertStoreSource, /Snapshot\.v1/);
        }

        assert.match(
            upcomingAlertsSource,
            /hydrateElectronicHorizonAlprNodes\(\)/,
        );
        assert.match(wazePoliceAlertsSource, /hydrateWazePoliceAlerts\(\)/);
        assert.match(durableAlertStoreSource, /new AbortController\(\)/);
        assert.match(durableAlertStoreSource, /clearTimeout\(timeoutId\)/);
        assert.match(
            durableAlertStoreSource,
            /fetchItems\(input, abortController\.signal\)/,
        );
        assert.match(
            durableAlertStoreSource,
            /latestRequestedInput[\s\S]*?pendingInput/,
        );
        assert.match(
            durableAlertStoreSource,
            /storage\.getItem\(storageKey\)[\s\S]*?storage\.setItem/,
        );
    });
});
