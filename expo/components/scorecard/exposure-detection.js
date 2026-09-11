import { normalizeDirectionDegrees } from '../map/direction-values.js';
import {
    getScorecardMonitoringCameraKey,
    SCORECARD_CAMERA_REENTRY_DEBOUNCE_MS,
} from './scorecard-engine.js';
import {
    getScorecardCoordinateBearingDegrees,
    getScorecardCoordinateDistanceMeters,
    getScorecardStoredNumber,
} from './scorecard-geo.js';

export const SCORECARD_CAMERA_CONE_ANGLE_DEGREES = 45;
export const SCORECARD_CAMERA_RANGE_METERS = 50;

const CONE_ARC_SEGMENTS = 8;
const MAX_LOCATION_ACCURACY_METERS = 35;
const MAX_LOCATION_GAP_MS = 15 * 1000;
const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 70;
const MIN_MOVEMENT_METERS = 0.75;

function normalizeLocationSample(location) {
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
        (accuracy !== null && accuracy > MAX_LOCATION_ACCURACY_METERS)
    ) {
        return null;
    }

    return {
        accuracy,
        coordinate: [longitude, latitude],
        recordedAt,
    };
}

function findRangeDelimiter(value) {
    for (let index = 1; index < value.length; index += 1) {
        if (value[index] === '-') {
            return index;
        }
    }

    return -1;
}

export function parseCameraDirectionRanges(value) {
    if (value === null || value === undefined || value === '') {
        return [];
    }

    if (Array.isArray(value)) {
        return value.flatMap(parseCameraDirectionRanges);
    }

    if (value !== null && typeof value === 'object') {
        const start = normalizeDirectionDegrees(value.start);
        const end = normalizeDirectionDegrees(value.end ?? value.start);

        return start === null || end === null
            ? []
            : [
                  {
                      end,
                      isRange:
                          value.isRange === true || value.is_range === true,
                      start,
                  },
              ];
    }

    return String(value)
        .split(/[;,]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .flatMap((token) => {
            const rangeDelimiter = findRangeDelimiter(token);

            if (rangeDelimiter > 0) {
                const start = normalizeDirectionDegrees(
                    token.slice(0, rangeDelimiter),
                );
                const end = normalizeDirectionDegrees(
                    token.slice(rangeDelimiter + 1),
                );

                return start === null || end === null
                    ? []
                    : [{ end, isRange: true, start }];
            }

            const direction = normalizeDirectionDegrees(token);

            return direction === null
                ? []
                : [{ end: direction, isRange: false, start: direction }];
        });
}

function destinationPoint(coordinate, distanceMeters, bearingDegrees) {
    const earthRadiusMeters = 6371008.8;
    const angularDistance = distanceMeters / earthRadiusMeters;
    const bearing = (bearingDegrees * Math.PI) / 180;
    const latitude = (coordinate[1] * Math.PI) / 180;
    const longitude = (coordinate[0] * Math.PI) / 180;
    const destinationLatitude = Math.asin(
        Math.sin(latitude) * Math.cos(angularDistance) +
            Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const destinationLongitude =
        longitude +
        Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
            Math.cos(angularDistance) -
                Math.sin(latitude) * Math.sin(destinationLatitude),
        );

    const destinationLongitudeDegrees = (destinationLongitude * 180) / Math.PI;
    const normalizedLongitude =
        ((((destinationLongitudeDegrees + 180) % 360) + 360) % 360) - 180;

    return [normalizedLongitude, (destinationLatitude * 180) / Math.PI];
}

export function makeScorecardCameraConeRing(coordinate, directionRange) {
    const halfCone = SCORECARD_CAMERA_CONE_ANGLE_DEGREES / 2;
    const start = directionRange.isRange
        ? directionRange.start
        : directionRange.start - halfCone;
    let end = directionRange.isRange
        ? directionRange.end
        : directionRange.start + halfCone;

    if (directionRange.isRange && end < start) {
        end += 360;
    }

    const ring = [coordinate];

    for (let index = 0; index <= CONE_ARC_SEGMENTS; index += 1) {
        ring.push(
            destinationPoint(
                coordinate,
                SCORECARD_CAMERA_RANGE_METERS,
                start + ((end - start) * index) / CONE_ARC_SEGMENTS,
            ),
        );
    }

    ring.push(coordinate);

    return ring;
}

function makeCircleRing(coordinate) {
    const ring = [];

    for (let index = 0; index < 32; index += 1) {
        ring.push(
            destinationPoint(
                coordinate,
                SCORECARD_CAMERA_RANGE_METERS,
                (index * 360) / 32,
            ),
        );
    }

    ring.push(ring[0]);

    return ring;
}

function pointIsInRing(coordinate, ring) {
    let inside = false;

    for (
        let currentIndex = 0, previousIndex = ring.length - 1;
        currentIndex < ring.length;
        previousIndex = currentIndex, currentIndex += 1
    ) {
        const current = ring[currentIndex];
        const previous = ring[previousIndex];
        const intersects =
            current[1] > coordinate[1] !== previous[1] > coordinate[1] &&
            coordinate[0] <
                ((previous[0] - current[0]) * (coordinate[1] - current[1])) /
                    (previous[1] - current[1] || Number.EPSILON) +
                    current[0];

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function orientation(start, end, point) {
    return (
        (end[0] - start[0]) * (point[1] - start[1]) -
        (end[1] - start[1]) * (point[0] - start[0])
    );
}

function pointIsOnSegment(point, start, end) {
    return (
        point[0] >= Math.min(start[0], end[0]) - 1e-12 &&
        point[0] <= Math.max(start[0], end[0]) + 1e-12 &&
        point[1] >= Math.min(start[1], end[1]) - 1e-12 &&
        point[1] <= Math.max(start[1], end[1]) + 1e-12
    );
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
    const firstOrientation = orientation(firstStart, firstEnd, secondStart);
    const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
    const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
    const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

    if (
        ((firstOrientation > 0 && secondOrientation < 0) ||
            (firstOrientation < 0 && secondOrientation > 0)) &&
        ((thirdOrientation > 0 && fourthOrientation < 0) ||
            (thirdOrientation < 0 && fourthOrientation > 0))
    ) {
        return true;
    }

    return (
        (Math.abs(firstOrientation) < 1e-12 &&
            pointIsOnSegment(secondStart, firstStart, firstEnd)) ||
        (Math.abs(secondOrientation) < 1e-12 &&
            pointIsOnSegment(secondEnd, firstStart, firstEnd)) ||
        (Math.abs(thirdOrientation) < 1e-12 &&
            pointIsOnSegment(firstStart, secondStart, secondEnd)) ||
        (Math.abs(fourthOrientation) < 1e-12 &&
            pointIsOnSegment(firstEnd, secondStart, secondEnd))
    );
}

function segmentIntersectsRing(start, end, ring) {
    if (pointIsInRing(start, ring) || pointIsInRing(end, ring)) {
        return true;
    }

    for (let index = 1; index < ring.length; index += 1) {
        if (segmentsIntersect(start, end, ring[index - 1], ring[index])) {
            return true;
        }
    }

    return false;
}

function getCameraPresentation(node) {
    const tags =
        node?.tags && typeof node.tags === 'object' && !Array.isArray(node.tags)
            ? node.tags
            : {};

    return {
        label:
            node?.label ||
            node?.name ||
            tags.name ||
            tags['addr:street'] ||
            tags.road ||
            (node?.osmId === null || node?.osmId === undefined
                ? 'ALPR camera'
                : `ALPR camera · OSM ${node.osmId}`),
        operator:
            typeof node?.operator === 'string'
                ? node.operator
                : typeof tags.operator === 'string'
                  ? tags.operator
                  : null,
    };
}

function normalizeNodeCoordinate(node) {
    const longitude = getScorecardStoredNumber(node?.coordinate?.[0]);
    const latitude = getScorecardStoredNumber(node?.coordinate?.[1]);

    return longitude === null || latitude === null
        ? null
        : [longitude, latitude];
}

function formatDirectionLabel(directionRanges) {
    if (directionRanges.length === 0) {
        return 'Direction not reported';
    }

    return directionRanges
        .map((direction) =>
            direction.isRange
                ? `${direction.start}°–${direction.end}°`
                : `${direction.start}°`,
        )
        .join(', ');
}

function getSegmentDisposition(previousSample, currentSample) {
    const elapsedMs = currentSample.recordedAt - previousSample.recordedAt;
    const distanceMeters = getScorecardCoordinateDistanceMeters(
        previousSample.coordinate,
        currentSample.coordinate,
    );

    if (elapsedMs <= 0 || distanceMeters === null) {
        return 'reject';
    }

    if (elapsedMs > MAX_LOCATION_GAP_MS) {
        return 'reanchor';
    }

    if (distanceMeters < MIN_MOVEMENT_METERS) {
        return 'reject';
    }

    return distanceMeters / (elapsedMs / 1000) <=
        MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND
        ? 'process'
        : 'reject';
}

export function processScorecardExposureSegment({
    currentLocation,
    detectorState = { cameras: {} },
    nodes = [],
    previousLocation,
}) {
    const previousSample = normalizeLocationSample(previousLocation);
    const currentSample = normalizeLocationSample(currentLocation);

    if (!currentSample) {
        return {
            detectorState,
            exposures: [],
            nextLocationAnchor: previousLocation ?? null,
            segmentAccepted: false,
        };
    }

    if (!previousSample) {
        return {
            detectorState,
            exposures: [],
            nextLocationAnchor: currentLocation,
            segmentAccepted: false,
        };
    }

    const segmentDisposition = getSegmentDisposition(
        previousSample,
        currentSample,
    );

    if (segmentDisposition !== 'process') {
        return {
            detectorState,
            exposures: [],
            nextLocationAnchor:
                segmentDisposition === 'reanchor'
                    ? currentLocation
                    : previousLocation,
            segmentAccepted: false,
        };
    }

    const cameraStates = { ...(detectorState.cameras ?? {}) };
    const exposures = [];
    const travelHeading = getScorecardCoordinateBearingDegrees(
        previousSample.coordinate,
        currentSample.coordinate,
    );

    for (const node of nodes) {
        const coordinate = normalizeNodeCoordinate(node);
        const osmId = node?.osmId ?? node?.osm_id ?? null;

        if (!coordinate) {
            continue;
        }

        const directionRanges = parseCameraDirectionRanges(
            node.directions ??
                node.cameraDirections ??
                node.direction ??
                node.cameraDirection,
        );
        const cameraId = getScorecardMonitoringCameraKey({
            ...node,
            coordinate,
            directions: directionRanges,
            osmId,
        });

        if (!cameraId) {
            continue;
        }

        const directionKnown = directionRanges.length > 0;
        const rings = directionKnown
            ? directionRanges.map((direction) =>
                  makeScorecardCameraConeRing(coordinate, direction),
              )
            : [makeCircleRing(coordinate)];
        const previousCameraState = cameraStates[cameraId] ?? {};
        const previousInside = rings.some((ring) =>
            pointIsInRing(previousSample.coordinate, ring),
        );
        const currentInside = rings.some((ring) =>
            pointIsInRing(currentSample.coordinate, ring),
        );
        const intersects = rings.some((ring) =>
            segmentIntersectsRing(
                previousSample.coordinate,
                currentSample.coordinate,
                ring,
            ),
        );
        const wasInside = previousCameraState.inside ?? previousInside;
        const debounceExpired =
            !Number.isFinite(previousCameraState.lastReadAt) ||
            currentSample.recordedAt - previousCameraState.lastReadAt >=
                SCORECARD_CAMERA_REENTRY_DEBOUNCE_MS;

        if (intersects && !wasInside && debounceExpired) {
            const presentation = getCameraPresentation(node);

            exposures.push({
                cameraCoordinate: coordinate,
                cameraDirectionLabel: formatDirectionLabel(directionRanges),
                cameraDirections: directionRanges,
                certainty: directionKnown ? 'confirmed' : 'possible',
                label: presentation.label,
                occurredAt: currentSample.recordedAt,
                operator: presentation.operator,
                osmId:
                    osmId === null || osmId === undefined
                        ? null
                        : String(osmId),
                routeSegmentCoordinates: [
                    previousSample.coordinate,
                    currentSample.coordinate,
                ],
                travelHeading,
            });
            cameraStates[cameraId] = {
                inside: currentInside,
                lastReadAt: currentSample.recordedAt,
            };
        } else {
            cameraStates[cameraId] = {
                ...previousCameraState,
                inside: currentInside,
            };
        }
    }

    return {
        detectorState: { cameras: cameraStates },
        exposures,
        nextLocationAnchor: currentLocation,
        segmentAccepted: true,
    };
}
