import {
    ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS,
    getActiveRouteDeviationDistanceMeters,
} from './active-route-deviation';
import {
    createDirectionsRouteProgressTracker,
    getActiveDirectionsManeuver,
} from './directions';

const MANEUVER_LOCATION_MAX_AGE_MS = 10000;
const METERS_PER_SECOND_PER_MPH = 0.44704;
const MANEUVER_CLOSE_ZOOM_LEVELS = [
    { minSpeedMph: 40, zoomLevel: 16.5 },
    { minSpeedMph: 0, zoomLevel: 18.5 },
];
const MANEUVER_ZOOM_CHANGE_PER_SECOND = 0.4;

export function getManeuverZoomTarget({ speedZoom, speed, maneuver }) {
    const distance = maneuver?.distanceToManeuver;
    const type = maneuver?.type;

    if (
        !Number.isFinite(distance) ||
        distance < 0 ||
        !Number.isInteger(type) ||
        type < 0 ||
        type > 13 ||
        type === 6 ||
        type === 11
    ) {
        return speedZoom;
    }

    const speedMetersPerSecond = Number.isFinite(speed)
        ? Math.max(0, speed)
        : 0;
    const speedMph = speedMetersPerSecond / METERS_PER_SECOND_PER_MPH;
    const closeZoom = MANEUVER_CLOSE_ZOOM_LEVELS.find(
        ({ minSpeedMph }) => speedMph >= minSpeedMph,
    ).zoomLevel;

    // Start roughly 20 seconds ahead, bounded for slow and highway driving.
    const approachDistance = Math.min(
        600,
        Math.max(150, speedMetersPerSecond * 20),
    );
    const proximity = Math.min(
        1,
        Math.max(0, (approachDistance - distance) / (approachDistance - 25)),
    );
    const blend = proximity * proximity * (3 - 2 * proximity);

    return speedZoom + (closeZoom - speedZoom) * blend;
}

export function createManeuverFollowZoomController() {
    const progressTracker = createDirectionsRouteProgressTracker();
    let previousRecordedAt = null;
    let previousRoute = null;
    let previousZoom = null;
    let previousUpdatedAt = null;
    let isTransitioning = false;

    function update({
        route,
        location,
        speedZoom,
        now = Date.now(),
        force = false,
    }) {
        if (route !== previousRoute) {
            progressTracker.reset();
            previousRecordedAt = null;
            previousRoute = route;
        }

        const recordedAt = location?.recordedAt ?? location?.timestamp;
        const locationIsFresh =
            Number.isFinite(recordedAt) &&
            now - recordedAt >= -1000 &&
            now - recordedAt <= MANEUVER_LOCATION_MAX_AGE_MS &&
            (previousRecordedAt === null || recordedAt >= previousRecordedAt);
        let maneuver = null;

        if (route && locationIsFresh) {
            const progress = progressTracker.update(route, location);
            previousRecordedAt = recordedAt;
            const deviation = getActiveRouteDeviationDistanceMeters({
                routeProgress: progress,
                userLocation: location,
            });

            if (
                progress &&
                Number.isFinite(progress.distanceFromRoute) &&
                Number.isFinite(deviation) &&
                deviation <= ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS &&
                location?.roadMatch?.isOffRoad !== true
            ) {
                maneuver = getActiveDirectionsManeuver(
                    route,
                    location,
                    progress,
                );
                // Guidance can retain the final maneuver after the route ends.
                if (
                    maneuver?.type === 10 &&
                    maneuver.distanceToManeuver === 0
                ) {
                    maneuver = null;
                }
            }
        }

        const target = getManeuverZoomTarget({
            speedZoom,
            speed: location?.speed,
            maneuver,
        });
        isTransitioning = isTransitioning || target !== speedZoom;
        let zoom = target;

        if (!force && isTransitioning) {
            const elapsedSeconds =
                previousUpdatedAt === null
                    ? 1
                    : Math.min(
                          1,
                          Math.max(0, (now - previousUpdatedAt) / 1000),
                      );
            const maxChange = MANEUVER_ZOOM_CHANGE_PER_SECOND * elapsedSeconds;
            const startZoom = previousZoom ?? speedZoom;
            zoom =
                startZoom +
                Math.min(maxChange, Math.max(-maxChange, target - startZoom));
        }

        if (zoom === speedZoom) {
            isTransitioning = false;
        }
        previousZoom = zoom;
        previousUpdatedAt = now;
        return zoom;
    }

    return { update };
}
