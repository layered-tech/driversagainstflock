import {
    getScorecardCoordinateDistanceMeters,
    getScorecardStoredNumber,
} from './scorecard-geo.js';
import { SCORECARD_ROUTE_END_TOLERANCE_METERS } from './scorecard-route-progress.js';

export const SCORECARD_ARRIVAL_RADIUS_METERS = 45;

const ARRIVAL_CONFIRMATION_FIXES = 2;
const ARRIVAL_CONFIRMATION_MS = 3000;
const ARRIVAL_MAX_ACCURACY_METERS = 50;
const ARRIVAL_MAX_ROUTE_DEVIATION_METERS = 100;
const ARRIVAL_MINIMUM_ROUTE_PROGRESS = 0.9;

function getLocationSample(location) {
    const latitude = getScorecardStoredNumber(
        location?.coords?.latitude ?? location?.latitude,
    );
    const longitude = getScorecardStoredNumber(
        location?.coords?.longitude ?? location?.longitude,
    );
    const accuracy = getScorecardStoredNumber(
        location?.coords?.accuracy ?? location?.accuracy,
    );
    const recordedAt = getScorecardStoredNumber(
        location?.timestamp ?? location?.recordedAt,
    );

    if (
        latitude === null ||
        longitude === null ||
        recordedAt === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        (accuracy !== null && accuracy > ARRIVAL_MAX_ACCURACY_METERS)
    ) {
        return null;
    }

    return { coordinate: [longitude, latitude], recordedAt };
}

export function updateScorecardArrivalDetection({
    destinationCoordinate,
    location,
    routeDistanceMeters,
    routeProgress,
    state = null,
}) {
    const sample = getLocationSample(location);
    const distanceToDestination = sample
        ? getScorecardCoordinateDistanceMeters(
              sample.coordinate,
              destinationCoordinate,
          )
        : null;
    const progressDistance = getScorecardStoredNumber(
        routeProgress?.alongRouteDistance,
    );
    const routeDeviation = getScorecardStoredNumber(
        routeProgress?.distanceFromRoute,
    );
    const progressFraction =
        progressDistance !== null &&
        Number.isFinite(routeDistanceMeters) &&
        routeDistanceMeters > 0
            ? progressDistance / routeDistanceMeters
            : 0;
    const isNearDestination =
        distanceToDestination !== null &&
        distanceToDestination <= SCORECARD_ARRIVAL_RADIUS_METERS;
    const hasReachedRouteEnd =
        progressDistance !== null &&
        Number.isFinite(routeDistanceMeters) &&
        routeDistanceMeters > 0 &&
        progressDistance >=
            routeDistanceMeters - SCORECARD_ROUTE_END_TOLERANCE_METERS;
    const qualifies =
        sample !== null &&
        (isNearDestination
            ? progressFraction >= ARRIVAL_MINIMUM_ROUTE_PROGRESS
            : hasReachedRouteEnd) &&
        routeDeviation !== null &&
        routeDeviation <= ARRIVAL_MAX_ROUTE_DEVIATION_METERS;

    if (!qualifies) {
        return { arrived: false, state: null };
    }

    const firstQualifiedAt = Number.isFinite(state?.firstQualifiedAt)
        ? state.firstQualifiedAt
        : sample.recordedAt;
    const fixCount = Math.max(0, Number(state?.fixCount) || 0) + 1;
    const nextState = { firstQualifiedAt, fixCount };
    const arrived =
        fixCount >= ARRIVAL_CONFIRMATION_FIXES &&
        sample.recordedAt - firstQualifiedAt >= ARRIVAL_CONFIRMATION_MS;

    return { arrived, state: nextState };
}
