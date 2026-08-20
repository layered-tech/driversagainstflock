import { processScorecardExposureSegment } from './exposure-detection.js';
import { getScorecardMonitoringCameraKey } from './scorecard-engine.js';
import {
    getScorecardCoordinateDistanceMeters,
    getScorecardStoredNumber,
} from './scorecard-geo.js';

const MAX_DISTANCE_SAMPLE_GAP_MS = 15 * 1000;
const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 70;

function getLocationCoordinate(location) {
    const latitude = getScorecardStoredNumber(
        location?.coords?.latitude ?? location?.latitude,
    );
    const longitude = getScorecardStoredNumber(
        location?.coords?.longitude ?? location?.longitude,
    );

    return latitude === null || longitude === null
        ? null
        : [longitude, latitude];
}

function getLocationTimestamp(location) {
    return getScorecardStoredNumber(
        location?.timestamp ?? location?.recordedAt,
    );
}

function getPlausibleDistanceMeters(previousLocation, currentLocation) {
    const previousCoordinate = getLocationCoordinate(previousLocation);
    const currentCoordinate = getLocationCoordinate(currentLocation);
    const previousTimestamp = getLocationTimestamp(previousLocation);
    const currentTimestamp = getLocationTimestamp(currentLocation);
    const elapsedMs =
        previousTimestamp === null || currentTimestamp === null
            ? null
            : currentTimestamp - previousTimestamp;
    const distanceMeters =
        previousCoordinate && currentCoordinate
            ? getScorecardCoordinateDistanceMeters(
                  previousCoordinate,
                  currentCoordinate,
              )
            : null;

    if (
        distanceMeters === null ||
        elapsedMs === null ||
        elapsedMs <= 0 ||
        elapsedMs > MAX_DISTANCE_SAMPLE_GAP_MS ||
        distanceMeters / (elapsedMs / 1000) >
            MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND
    ) {
        return 0;
    }

    return distanceMeters;
}

export function getScorecardDriveCameraCatalog(
    activeSession,
    supplementalNodes = [],
) {
    const cameras = new Map();

    for (const node of supplementalNodes) {
        const cameraKey = getScorecardMonitoringCameraKey(node);

        if (cameraKey !== null) {
            cameras.set(cameraKey, node);
        }
    }

    if (activeSession?.mode === 'guided') {
        for (const node of activeSession.monitoringCameras ?? []) {
            const cameraKey = getScorecardMonitoringCameraKey(node);

            if (cameraKey !== null) {
                cameras.set(cameraKey, node);
            }
        }
    }

    return [...cameras.values()];
}

export function updateScorecardRawLocationAnchor(
    previousLocation,
    currentLocation,
) {
    if (!currentLocation) {
        return previousLocation ?? null;
    }

    return processScorecardExposureSegment({
        currentLocation,
        nodes: [],
        previousLocation,
    }).nextLocationAnchor;
}

export function processScorecardRawLocationFix({
    activeSession,
    currentLocation,
    detectorState = { cameras: {} },
    previousLocation,
    supplementalNodes = [],
}) {
    if (!activeSession || !currentLocation) {
        return {
            detectorState,
            distanceMeters: 0,
            exposures: [],
            previousLocation: currentLocation ?? previousLocation ?? null,
        };
    }

    const exposureResult = processScorecardExposureSegment({
        currentLocation,
        detectorState,
        nodes: getScorecardDriveCameraCatalog(activeSession, supplementalNodes),
        previousLocation,
    });

    return {
        detectorState: exposureResult.detectorState,
        distanceMeters:
            activeSession.mode === 'free' && exposureResult.segmentAccepted
                ? getPlausibleDistanceMeters(previousLocation, currentLocation)
                : 0,
        exposures: exposureResult.exposures,
        previousLocation: exposureResult.nextLocationAnchor,
    };
}
