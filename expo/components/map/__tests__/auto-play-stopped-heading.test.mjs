import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getLocationWithDrivingMotionState } from '../driving-location-state.js';
import { resolveDrivingMotionState } from '../driving-motion-resolution.js';

function createLocationHandler(relativePath) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const handler = source.match(
        /    const handleUserLocationUpdate = useCallback\([\s\S]*?^    \);/m,
    );
    assert.ok(handler, 'the map surface must have a location update handler');

    const userLocationRef = { current: null };
    const currentCompassHeadingRef = { current: null };
    const followedLocations = [];
    const context = {
        useCallback: (callback) => callback,
        shouldAcceptLocationUpdate: () => true,
        roadMatchedLocationWatchEnabledRef: { current: true },
        getLocationUpdate: ({ coords: { heading, ...coords }, timestamp }) => ({
            ...coords,
            recordedAt: timestamp,
        }),
        isMountedRef: { current: true },
        userLocationRef,
        locationUpdateIsStale: () => false,
        getLocationCourseHeading: (location) => location.coords.heading,
        getDrivingMotionState: ({ nextLocation, ...options }) =>
            resolveDrivingMotionState({
                ...options,
                derivedMotion: { courseHeading: null, speed: null },
                measuredSpeed: nextLocation.speed,
                minimumCourseSpeed: 1.5,
            }),
        mapApiMocksAreEnabled: () => false,
        currentCourseHeadingRef: { current: null },
        currentCompassHeadingRef,
        isDrivingMode: true,
        getLocationWithDrivingMotionState,
        setUserLocation: () => {},
        locationTrackingModeRef: { current: 'follow' },
        LOCATION_TRACKING_FOLLOW: 'follow',
        mapBrowsingContextIsActiveRef: { current: false },
        lockOnLocationMode: { handleLocationUpdate: () => false },
        followLocationMode: {
            handleLocationUpdate: (_mode, location) => {
                followedLocations.push(location);
            },
        },
    };
    const handleLocation = new Function(
        ...Object.keys(context),
        `${handler[0]}\nreturn handleUserLocationUpdate;`,
    )(...Object.values(context));
    let timestamp = 0;

    return (heading, speed, compassHeading) => {
        currentCompassHeadingRef.current = compassHeading;
        handleLocation({
            coords: { latitude: 30, longitude: -97, heading, speed },
            timestamp: (timestamp += 1000),
        });

        assert.equal(followedLocations.at(-1), userLocationRef.current);

        return userLocationRef.current;
    };
}

for (const [surface, relativePath] of [
    ['car screen', '../../auto-play-map-surface-content.js'],
    ['phone', '../use-map-location-controller.js'],
]) {
    describe(`${surface} heading through stops`, () => {
        for (const heading of [0, 45, 135, 225, 315, 359]) {
            test(`preserves ${heading} degrees until travel resumes`, () => {
                const update = createLocationHandler(relativePath);
                assert.equal(update(heading, 8, null).heading, heading);

                for (const speed of [1, 0, 0, 0]) {
                    for (const compassHeading of [180, 270, 45, null]) {
                        const stopped = update(270, speed, compassHeading);

                        assert.equal(stopped.isMoving, false);
                        assert.equal(stopped.courseHeading, undefined);
                        assert.equal(stopped.heading, heading);
                    }
                }

                const resumedHeading = (heading + 90) % 360;
                const resumed = update(resumedHeading, 8, 180);
                assert.equal(resumed.isMoving, true);
                assert.equal(resumed.heading, resumedHeading);
                assert.equal(resumed.courseHeading, resumedHeading);
                assert.equal(update(null, 0, 270).heading, resumedHeading);
            });
        }
    });
}
