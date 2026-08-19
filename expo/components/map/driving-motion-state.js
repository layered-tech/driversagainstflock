import { MINIMUM_DRIVING_COURSE_SPEED_MPS } from './constants';
import { resolveDrivingMotionState } from './driving-motion-resolution';
import {
    getCoordinateBearingDegrees,
    getCoordinateDistanceMeters,
    getStoredNumber,
} from './geo';

const MINIMUM_DERIVED_COURSE_DISTANCE_METERS = 2;
const MAXIMUM_DERIVED_COURSE_INTERVAL_MS = 5000;

function getLocationCoordinatePair(location) {
    const longitude = getStoredNumber(location?.longitude);
    const latitude = getStoredNumber(location?.latitude);

    if (longitude === null || latitude === null) {
        return null;
    }

    return [longitude, latitude];
}

function getDerivedMotion(previousLocation, nextLocation) {
    const previousCoordinate = getLocationCoordinatePair(previousLocation);
    const nextCoordinate = getLocationCoordinatePair(nextLocation);
    const previousRecordedAt = getStoredNumber(previousLocation?.recordedAt);
    const nextRecordedAt = getStoredNumber(nextLocation?.recordedAt);

    if (!previousCoordinate || !nextCoordinate) {
        return {
            courseHeading: null,
            speed: null,
        };
    }

    const distanceMeters = getCoordinateDistanceMeters(
        previousCoordinate,
        nextCoordinate,
    );

    if (
        distanceMeters === null ||
        distanceMeters < MINIMUM_DERIVED_COURSE_DISTANCE_METERS
    ) {
        return {
            courseHeading: null,
            speed: null,
        };
    }

    const elapsedMs =
        nextRecordedAt !== null && previousRecordedAt !== null
            ? nextRecordedAt - previousRecordedAt
            : null;
    const speed =
        elapsedMs !== null &&
        elapsedMs > 0 &&
        elapsedMs <= MAXIMUM_DERIVED_COURSE_INTERVAL_MS
            ? distanceMeters / (elapsedMs / 1000)
            : null;

    return {
        courseHeading: getCoordinateBearingDegrees(
            previousCoordinate,
            nextCoordinate,
        ),
        speed,
    };
}

export function getDrivingMotionState({
    fallbackCourseHeading,
    locationCourseHeading,
    nextLocation,
    preferDerivedMotion = false,
    previousLocation,
}) {
    const derivedMotion = getDerivedMotion(previousLocation, nextLocation);
    const measuredSpeed = getStoredNumber(nextLocation?.speed);

    return resolveDrivingMotionState({
        derivedMotion,
        fallbackCourseHeading,
        locationCourseHeading,
        measuredSpeed,
        minimumCourseSpeed: MINIMUM_DRIVING_COURSE_SPEED_MPS,
        preferDerivedMotion,
    });
}
