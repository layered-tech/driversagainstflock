import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getLocationPuckPresentationLocation,
    LOCATION_PUCK_PREDICTION_HORIZON_MS,
} from '../location-puck-presentation.js';

const EARTH_RADIUS_METERS = 6371008.8;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

function getCoordinateDistanceMeters(
    [fromLongitude, fromLatitude],
    [toLongitude, toLatitude],
) {
    const latitudeDifference = degreesToRadians(toLatitude - fromLatitude);
    const longitudeDifference = degreesToRadians(toLongitude - fromLongitude);
    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.sin(longitudeDifference / 2) ** 2;

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

function getCoordinateBearingDegrees(
    [fromLongitude, fromLatitude],
    [toLongitude, toLatitude],
) {
    const longitudeDifference = degreesToRadians(toLongitude - fromLongitude);
    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const y = Math.sin(longitudeDifference) * Math.cos(toLatitudeRadians);
    const x =
        Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
        Math.sin(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.cos(longitudeDifference);

    return (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
}

function makeLocation(overrides = {}) {
    return {
        courseHeading: 90,
        isMoving: true,
        latitude: 41.8781,
        longitude: -87.6298,
        recordedAt: 10_000,
        roadMatch: { isOffRoad: false },
        speed: 20,
        ...overrides,
    };
}

describe('location puck presentation', () => {
    test('projects a fresh moving road match a short distance ahead', () => {
        const location = makeLocation();
        const presentationLocation = getLocationPuckPresentationLocation(
            location,
            10_100,
        );
        const distanceMeters = getCoordinateDistanceMeters(
            [location.longitude, location.latitude],
            [presentationLocation.longitude, presentationLocation.latitude],
        );
        const bearing = getCoordinateBearingDegrees(
            [location.longitude, location.latitude],
            [presentationLocation.longitude, presentationLocation.latitude],
        );

        assert.notEqual(presentationLocation, location);
        assert.ok(
            Math.abs(
                distanceMeters -
                    location.speed *
                        (LOCATION_PUCK_PREDICTION_HORIZON_MS / 1000),
            ) < 0.01,
        );
        assert.ok(Math.abs(bearing - location.courseHeading) < 0.01);
        assert.equal(presentationLocation.recordedAt, location.recordedAt);
        assert.equal(
            presentationLocation.roadMatch,
            location.roadMatch,
            'Presentation-only coordinates must retain the authoritative match metadata.',
        );
    });

    test('does not predict stationary, off-road, or stale locations', () => {
        [
            makeLocation({ isMoving: false }),
            makeLocation({ roadMatch: { isOffRoad: true } }),
            makeLocation({ recordedAt: 7_000 }),
        ].forEach((location) => {
            assert.equal(
                getLocationPuckPresentationLocation(location, 10_100),
                location,
            );
        });
    });

    test('caps the projected distance at twenty meters', () => {
        const location = makeLocation({ speed: 80 });
        const presentationLocation = getLocationPuckPresentationLocation(
            location,
            10_100,
        );
        const distanceMeters = getCoordinateDistanceMeters(
            [location.longitude, location.latitude],
            [presentationLocation.longitude, presentationLocation.latitude],
        );

        assert.ok(Math.abs(distanceMeters - 20) < 0.01);
    });
});
