import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getLocationPuckPresentationLocation,
    LOCATION_PUCK_PREDICTION_HORIZON_MS,
    LOCATION_PUCK_PREDICTION_MAXIMUM_AGE_MS,
    startLocationPuckPresentationUpdates,
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

function createPresentationClock(startTime = 10_000) {
    let currentTime = startTime;
    let nextId = 0;
    const scheduled = new Map();
    const locations = [];

    return {
        locations,
        options: {
            cancel: (id) => scheduled.delete(id),
            now: () => currentTime,
            onLocation: (location) => locations.push(location),
            schedule(callback, delay) {
                const id = ++nextId;
                scheduled.set(id, { callback, time: currentTime + delay });
                return id;
            },
        },
        get pendingCount() {
            return scheduled.size;
        },
        advance(time, { delayed = false } = {}) {
            for (;;) {
                const next = [...scheduled.entries()]
                    .filter(([, entry]) => entry.time <= time)
                    .sort((first, second) => first[1].time - second[1].time)[0];

                if (!next) break;
                scheduled.delete(next[0]);
                currentTime = delayed ? time : next[1].time;
                next[1].callback();
            }

            currentTime = time;
        },
    };
}

describe('location puck presentation', () => {
    test('keeps advancing between one-second GPS fixes instead of holding a fixed target', () => {
        const location = makeLocation();
        let previous = getLocationPuckPresentationLocation(location, 10_000);

        for (let now = 10_100; now <= 11_000; now += 100) {
            const next = getLocationPuckPresentationLocation(location, now);
            const distance = getCoordinateDistanceMeters(
                [previous.longitude, previous.latitude],
                [next.longitude, next.latitude],
            );

            assert.ok(Math.abs(distance - 2) < 0.01, `Puck stopped at ${now}`);
            assert.equal(next.recordedAt, location.recordedAt);
            assert.equal(next.roadMatch, location.roadMatch);
            previous = next;
        }
    });

    test('keeps advancing at highway speed through a delayed fix', () => {
        const location = makeLocation({ speed: 35 });
        const earlier = getLocationPuckPresentationLocation(location, 10_500);
        const later = getLocationPuckPresentationLocation(location, 11_500);
        const distance = getCoordinateDistanceMeters(
            [earlier.longitude, earlier.latitude],
            [later.longitude, later.latitude],
        );

        assert.ok(Math.abs(distance - 35) < 0.01);
    });

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
                        ((100 + LOCATION_PUCK_PREDICTION_HORIZON_MS) / 1000),
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

    test('does not predict ahead when presentation prediction is disabled', () => {
        const location = makeLocation();

        assert.equal(
            getLocationPuckPresentationLocation(location, 10_100, {
                predictionEnabled: false,
            }),
            location,
        );
    });

    test('caps the lead at twenty meters beyond elapsed travel', () => {
        const location = makeLocation({ speed: 80 });
        const presentationLocation = getLocationPuckPresentationLocation(
            location,
            10_100,
        );
        const distanceMeters = getCoordinateDistanceMeters(
            [location.longitude, location.latitude],
            [presentationLocation.longitude, presentationLocation.latitude],
        );

        assert.ok(Math.abs(distanceMeters - 28) < 0.01);
    });
});

describe('location puck presentation updates', () => {
    test('publishes moving targets between GPS updates without changing the source fix', () => {
        const clock = createPresentationClock();
        const location = makeLocation();
        const originalLocation = structuredClone(location);
        const stop = startLocationPuckPresentationUpdates(
            location,
            clock.options,
        );

        clock.advance(10_900);
        assert.equal(clock.locations.length, 10);
        for (let i = 1; i < clock.locations.length; i++) {
            const previous = clock.locations[i - 1];
            const current = clock.locations[i];
            const distance = getCoordinateDistanceMeters(
                [previous.longitude, previous.latitude],
                [current.longitude, current.latitude],
            );

            assert.ok(Math.abs(distance - 2) < 0.01);
            assert.equal(current.recordedAt, location.recordedAt);
            assert.equal(current.roadMatch, location.roadMatch);
        }
        assert.deepEqual(location, originalLocation);
        stop();
        assert.equal(clock.pendingCount, 0);
        clock.advance(12_000);
        assert.equal(clock.locations.length, 10);
    });

    test('replaces prediction with the next fix without pausing steady travel', () => {
        const clock = createPresentationClock();
        const location = makeLocation();
        const stop = startLocationPuckPresentationUpdates(
            location,
            clock.options,
        );
        clock.advance(11_000);
        const previous = clock.locations.at(-1);
        stop();

        const nextCoordinate = getLocationPuckPresentationLocation(
            location,
            10_500,
        );
        const nextFix = {
            ...location,
            latitude: nextCoordinate.latitude,
            longitude: nextCoordinate.longitude,
            recordedAt: 11_000,
        };
        const stopNext = startLocationPuckPresentationUpdates(
            nextFix,
            clock.options,
        );
        const firstNext = clock.locations.at(-1);
        assert.ok(
            getCoordinateDistanceMeters(
                [previous.longitude, previous.latitude],
                [firstNext.longitude, firstNext.latitude],
            ) < 0.01,
        );

        clock.advance(11_100);
        const secondNext = clock.locations.at(-1);
        assert.ok(
            Math.abs(
                getCoordinateDistanceMeters(
                    [firstNext.longitude, firstNext.latitude],
                    [secondNext.longitude, secondNext.latitude],
                ) - 2,
            ) < 0.01,
        );
        stopNext();
    });

    test('holds the last predicted position when a fix expires, including a delayed timer', () => {
        for (const delayed of [false, true]) {
            const clock = createPresentationClock();
            const location = makeLocation();
            const stop = startLocationPuckPresentationUpdates(
                location,
                clock.options,
            );
            clock.advance(13_000, { delayed });
            const last = clock.locations.at(-1);
            const limit = getLocationPuckPresentationLocation(
                location,
                location.recordedAt + LOCATION_PUCK_PREDICTION_MAXIMUM_AGE_MS,
            );

            assert.deepEqual(last, limit);
            assert.equal(clock.pendingCount, 0);
            const count = clock.locations.length;
            clock.advance(15_000);
            assert.equal(clock.locations.length, count);
            stop();
        }
    });

    test('stops prediction as soon as a stopped or off-road fix replaces it', () => {
        for (const overrides of [
            { isMoving: false },
            { roadMatch: { isOffRoad: true } },
        ]) {
            const clock = createPresentationClock();
            const stop = startLocationPuckPresentationUpdates(
                makeLocation(),
                clock.options,
            );
            clock.advance(10_500);
            stop();
            const nextFix = makeLocation({ recordedAt: 10_500, ...overrides });
            const stopNext = startLocationPuckPresentationUpdates(
                nextFix,
                clock.options,
            );

            assert.equal(clock.locations.at(-1), nextFix);
            assert.equal(clock.pendingCount, 0);
            stopNext();
        }
    });

    test('does not schedule predictions for disabled, stale, or invalid fixes', () => {
        for (const overrides of [
            { isMoving: false },
            { roadMatch: { isOffRoad: true } },
            { speed: 0 },
            { speed: null },
            { courseHeading: null },
            { latitude: null },
            { recordedAt: 7_000 },
            { recordedAt: 11_000 },
            { recordedAt: null },
        ]) {
            const clock = createPresentationClock();
            const location = makeLocation(overrides);
            const stop = startLocationPuckPresentationUpdates(
                location,
                clock.options,
            );

            assert.deepEqual(clock.locations, [location]);
            assert.equal(clock.pendingCount, 0);
            stop();
        }

        const clock = createPresentationClock();
        const location = makeLocation();
        const stop = startLocationPuckPresentationUpdates(location, {
            ...clock.options,
            predictionEnabled: false,
        });
        assert.deepEqual(clock.locations, [location]);
        assert.equal(clock.pendingCount, 0);
        stop();
    });
});
