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
const drivingLocationProviderSource = readSource(
    '../driving-location-provider.js',
);
const easJson = JSON.parse(readSource('../../../eas.json'));
const indexSource = readSource('../../../index.js');
const locationDebugOverlaySource = readSource('../location-debug-overlay.js');
const locationPuck3DSource = readSource('../location-puck-3d.js');
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

    test('feeds matched coordinates through the custom provider and Maps 3D puck', () => {
        assert.match(
            drivingLocationProviderSource,
            /<Mapbox\.CustomLocationProvider[\s\S]*?coordinate=\{providerLocation\.coordinate\}[\s\S]*?heading=\{heading\}/,
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
            /centerCoordinate=\{androidFollowCameraStop\?\.centerCoordinate\}/,
        );
        assert.match(
            mapCanvasSource,
            /padding=\{androidFollowCameraStop\?\.padding\}/,
        );
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
        assert.match(mapLocationPuckAndroidSource, /LocationPuck3D\(/);
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
        assert.match(
            mapLocationPuckAndroidSource,
            /val hadLocationPuck3D[\s\S]*?if \(hadLocationPuck3D\) \{[\s\S]*?showNativeUserLocation\(false\)/,
        );
        assert.match(
            mapLocationPuckAndroidSource,
            /mapbox-location-model-layer/,
        );
        assert.match(mapLocationPuckIOSSource, /Puck3DConfiguration\(/);
        assert.match(mapLocationPuckIOSSource, /import MapboxMaps/);
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
        assert.match(appConfigSource, /isIosBackgroundLocationEnabled: true/);
        assert.match(
            appConfigSource,
            /android\.permission\.RECEIVE_BOOT_COMPLETED/,
        );
        assert.match(
            roadMatchingSessionSource,
            /Platform\.OS !== 'ios'[\s\S]*?return true/,
        );
        assert.match(
            roadMatchingSessionSource,
            /async function stopBackgroundLocationTask\(\)[\s\S]*?hasStartedLocationUpdatesAsync/,
        );
        assert.match(
            roadMatchingSessionSource,
            /setSessionStateToObservingIfAwaitingLocation/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /RNMapboxNavigation|retiredNavigationModule|startTripSession/,
        );
        assert.equal(
            easJson.build[
                'e2e-test'
            ].env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.startsWith('pk.'),
            true,
        );
    });
});
