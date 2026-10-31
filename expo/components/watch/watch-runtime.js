import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import {
    addAcceptedDeviceLocationListener,
    getLatestAcceptedDeviceLocation,
} from '../map/accepted-device-location';
import { APP_ENVIRONMENT } from '../map/config';
import {
    getActiveDirectionsManeuver,
    getDirectionsRouteProgress,
    getRemainingDirectionsRouteValues,
} from '../map/directions';
import { getLocationUpdate } from '../map/geo';
import {
    getSharedNavigationRerouting,
    subscribeSharedNavigationRerouting,
} from '../map/shared-navigation-controller';
import {
    addSharedRoutingStateListener,
    getDirectionsRouteGeometrySyncKey,
    getSharedRoutingState,
    sharedRoutingStateCanPublish,
} from '../map/shared-routing-state';
import {
    getScorecardActiveDriveSummary,
    getScorecardRuntimeSnapshot,
    subscribeScorecardRuntime,
} from '../scorecard/scorecard-runtime-instance';
import {
    createWatchSnapshot,
    watchEnvironmentIsSupported,
} from './watch-contract';
import { createWatchPublisher } from './watch-publisher';
import { createWatchCuePlanner } from './watch-cues';
import { createWatchCameraCuePlanner } from './watch-camera-cues';
import {
    getWatchCameraPreferences,
    loadWatchCameraPreferences,
    subscribeWatchCameraPreferences,
} from './watch-camera-preferences';
import { markWatchAreaRead, refreshWatchAreas } from './watch-areas-runtime';
import {
    getWatchAreas,
    getWatchUpcomingAlerts,
    subscribeWatchSharedState,
} from './watch-shared-state';
import {
    createWatchCameraAppearanceTracker,
    projectWatchCamera,
    projectWatchRecap,
} from './watch-projections';
import {
    loadWatchHapticPreferences,
    subscribeWatchHaptics,
    watchHapticsEnabled,
} from './watch-haptic-preferences';

let initialized = false;
export function initializeWatchRuntime() {
    if (
        initialized ||
        Platform.OS !== 'android' ||
        !watchEnvironmentIsSupported(APP_ENVIRONMENT)
    )
        return;
    const transport = requireOptionalNativeModule('WatchCompanion');
    if (!transport) return;
    initialized = true;
    const publisherStartedAt = Date.now();
    const publisherId = Crypto.randomUUID();
    let sessionId = null;
    let routeKey = null;
    let routeRevision = 0;
    const trackCameraAppearance = createWatchCameraAppearanceTracker();
    const cuePlanner = createWatchCuePlanner();
    const cameraCuePlanner = createWatchCameraCuePlanner();
    const publisher = createWatchPublisher({
        readSnapshot(revision) {
            const state = getSharedRoutingState();
            const active =
                state.drivingModeIsActive && Boolean(state.directionsRoute);
            const nextKey = active
                ? getDirectionsRouteGeometrySyncKey(state.directionsRoute)
                : null;
            if (active && !sessionId) sessionId = Crypto.randomUUID();
            if (!active) sessionId = null;
            if (nextKey !== routeKey) {
                routeRevision += 1;
                routeKey = nextKey;
            }
            const rawLocation = getLatestAcceptedDeviceLocation();
            const location = rawLocation
                ? getLocationUpdate(rawLocation)
                : null;
            const sourceAt =
                location && Number.isFinite(rawLocation.timestamp)
                    ? rawLocation.timestamp
                    : null;
            const route = state.directionsRoute;
            const progress =
                active && location
                    ? getDirectionsRouteProgress(route, location)
                    : null;
            const cameraAlert = trackCameraAppearance(
                projectWatchCamera(
                    getWatchUpcomingAlerts(),
                    sourceAt,
                    getWatchCameraPreferences().alertsEnabled &&
                        state.drivingModeIsActive &&
                        !getSharedNavigationRerouting(),
                ),
                Date.now(),
            );
            return createWatchSnapshot({
                publisherId,
                publisherStartedAt,
                revision,
                now: Date.now(),
                environment: APP_ENVIRONMENT,
                phoneVersion: Constants.expoConfig?.version ?? 'unknown',
                hapticsEnabled: watchHapticsEnabled(),
                sessionId,
                routeRevision,
                active,
                sourceAt,
                rerouting: getSharedNavigationRerouting(),
                destination:
                    route?.destination?.label || route?.destination?.inputValue,
                maneuver:
                    active && location
                        ? getActiveDirectionsManeuver(route, location, progress)
                        : null,
                remaining: active
                    ? getRemainingDirectionsRouteValues(
                          route,
                          location,
                          progress,
                      )
                    : null,
                scorecard: getScorecardActiveDriveSummary(),
                cameraAlert,
                areas: getWatchAreas(),
                recap: projectWatchRecap(getScorecardRuntimeSnapshot()),
                cameraAlertsEnabled: getWatchCameraPreferences().alertsEnabled,
            });
        },
        async publish(snapshot) {
            const latestLocation = getLatestAcceptedDeviceLocation();
            const speed =
                latestLocation?.timestamp === snapshot.navigation.sourceAt
                    ? getLocationUpdate(latestLocation)?.speed
                    : null;
            const cue = cuePlanner.consume(
                snapshot,
                speed,
                watchHapticsEnabled(),
                Date.now(),
            );
            const cameraCue = cameraCuePlanner.consume(
                snapshot,
                Date.now(),
                cue,
                getWatchCameraPreferences().alertsEnabled,
                speed,
            );
            await transport.publishSnapshot(JSON.stringify(snapshot));
            if (cue) await transport.sendHapticCue(JSON.stringify(cue));
            if (cameraCue)
                await transport.sendHapticCue(JSON.stringify(cameraCue));
        },
    });
    // Let the Scorecard runtime finish its atomic route/location update before reading it.
    let pending = false;
    const update = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
            pending = false;
            if (sharedRoutingStateCanPublish()) publisher.update();
        });
    };
    addSharedRoutingStateListener(update);
    addAcceptedDeviceLocationListener(update);
    subscribeSharedNavigationRerouting(update);
    subscribeScorecardRuntime(update);
    subscribeWatchHaptics(update);
    subscribeWatchCameraPreferences(update);
    subscribeWatchSharedState(update);
    loadWatchHapticPreferences()
        .then(update)
        .catch(() => {});
    loadWatchCameraPreferences()
        .then(update)
        .catch(() => {});
    refreshWatchAreas()
        .then(update)
        .catch(() => {});
    transport.addListener('onStateRequested', () => {
        if (sharedRoutingStateCanPublish()) publisher.update({ force: true });
        refreshWatchAreas().catch(() => {});
    });
    transport.addListener('onAreaOpened', ({ areaId }) => {
        markWatchAreaRead(Number(areaId))
            .then(async (read) => {
                if (read) await transport.confirmAreaRead(Number(areaId));
                update();
            })
            .catch(() => {});
    });
    transport
        .pendingAreaReads()
        .then((areaIds) => {
            areaIds.forEach((areaId) => {
                markWatchAreaRead(areaId)
                    .then(async (read) => {
                        if (read) await transport.confirmAreaRead(areaId);
                        update();
                    })
                    .catch(() => {});
            });
        })
        .catch(() => {});
    AppState.addEventListener('change', (state) => {
        if (state === 'active') update();
    });
    // A heartbeat reports transport liveness without changing active source timestamps.
    setInterval(update, 5_000);
    setInterval(() => refreshWatchAreas().catch(() => {}), 15 * 60_000);
    update();
}
