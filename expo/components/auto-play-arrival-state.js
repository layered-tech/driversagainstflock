export const AUTO_PLAY_ARRIVAL_RADIUS_METERS = 35;
export const AUTO_PLAY_ARRIVAL_HYSTERESIS_RADIUS_METERS = 55;
export const AUTO_PLAY_ARRIVAL_ROUTE_REMAINING_METERS = 120;
export const AUTO_PLAY_ARRIVAL_REQUIRED_FIXES = 3;

export function createAutoPlayArrivalDetector({
    arrivalRadiusMeters = AUTO_PLAY_ARRIVAL_RADIUS_METERS,
    hysteresisRadiusMeters = AUTO_PLAY_ARRIVAL_HYSTERESIS_RADIUS_METERS,
    maximumRouteDistanceRemainingMeters = AUTO_PLAY_ARRIVAL_ROUTE_REMAINING_METERS,
    requiredFixes = AUTO_PLAY_ARRIVAL_REQUIRED_FIXES,
} = {}) {
    const normalizedArrivalRadiusMeters = Math.max(
        0,
        Number(arrivalRadiusMeters) || AUTO_PLAY_ARRIVAL_RADIUS_METERS,
    );
    const normalizedHysteresisRadiusMeters = Math.max(
        normalizedArrivalRadiusMeters,
        Number(hysteresisRadiusMeters) ||
            AUTO_PLAY_ARRIVAL_HYSTERESIS_RADIUS_METERS,
    );
    const normalizedRequiredFixes = Math.max(
        1,
        Math.round(Number(requiredFixes) || AUTO_PLAY_ARRIVAL_REQUIRED_FIXES),
    );
    const normalizedMaximumRouteDistanceRemainingMeters = Math.max(
        normalizedHysteresisRadiusMeters,
        Number(maximumRouteDistanceRemainingMeters) ||
            AUTO_PLAY_ARRIVAL_ROUTE_REMAINING_METERS,
    );
    let activeRouteGeneration = null;
    let consecutiveArrivalFixes = 0;
    let arrivalWasReported = false;

    return {
        beginRoute(routeGeneration) {
            activeRouteGeneration = routeGeneration;
            consecutiveArrivalFixes = 0;
            arrivalWasReported = false;
        },
        recordLocation({
            distanceToDestinationMeters,
            routeDistanceRemainingMeters,
            routeGeneration,
        }) {
            if (
                routeGeneration !== activeRouteGeneration ||
                arrivalWasReported
            ) {
                return false;
            }

            const distance = Number(distanceToDestinationMeters);
            const routeDistanceRemaining = Number(routeDistanceRemainingMeters);

            if (
                !Number.isFinite(distance) ||
                distance < 0 ||
                !Number.isFinite(routeDistanceRemaining) ||
                routeDistanceRemaining < 0 ||
                routeDistanceRemaining >
                    normalizedMaximumRouteDistanceRemainingMeters
            ) {
                consecutiveArrivalFixes = 0;
                return false;
            }

            if (consecutiveArrivalFixes === 0) {
                if (distance > normalizedArrivalRadiusMeters) {
                    return false;
                }
            } else if (distance > normalizedHysteresisRadiusMeters) {
                consecutiveArrivalFixes = 0;
                return false;
            }

            consecutiveArrivalFixes += 1;

            if (consecutiveArrivalFixes < normalizedRequiredFixes) {
                return false;
            }

            arrivalWasReported = true;
            return true;
        },
        reset() {
            activeRouteGeneration = null;
            consecutiveArrivalFixes = 0;
            arrivalWasReported = false;
        },
    };
}
