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
    subscribeScorecardRuntime,
} from '../scorecard/scorecard-runtime-instance';
import {
    createWatchSnapshot,
    watchEnvironmentIsSupported,
} from './watch-contract';
import { createWatchPublisher } from './watch-publisher';

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
            return createWatchSnapshot({
                publisherId,
                publisherStartedAt,
                revision,
                now: Date.now(),
                environment: APP_ENVIRONMENT,
                phoneVersion: Constants.expoConfig?.version ?? 'unknown',
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
            });
        },
        publish: (snapshot) =>
            transport.publishSnapshot(JSON.stringify(snapshot)),
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
    transport.addListener('onStateRequested', () => {
        if (sharedRoutingStateCanPublish()) publisher.update({ force: true });
    });
    AppState.addEventListener('change', (state) => {
        if (state === 'active') update();
    });
    // A heartbeat reports transport liveness without changing active source timestamps.
    setInterval(update, 5_000);
    update();
}
