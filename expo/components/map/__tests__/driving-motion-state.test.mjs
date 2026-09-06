import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getLocationWithDrivingMotionState } from '../driving-location-state.js';
import { resolveDrivingMotionState } from '../driving-motion-resolution.js';

describe('driving motion state', () => {
    test('keeps course bearing while the vehicle is moving', () => {
        const motionState = {
            courseHeading: 92,
            isMoving: true,
            speed: 8,
        };

        assert.deepEqual(
            getLocationWithDrivingMotionState({
                compassHeading: 180,
                courseHeading: 92,
                motionState,
                nextLocation: { latitude: 30, longitude: -97 },
            }),
            {
                compassHeading: 180,
                courseHeading: 92,
                heading: 92,
                isMoving: true,
                latitude: 30,
                longitude: -97,
                speed: 8,
            },
        );
    });

    test('drops stale course bearing when the vehicle stops', () => {
        const motionState = {
            courseHeading: null,
            isMoving: false,
            speed: 0,
        };

        assert.deepEqual(
            getLocationWithDrivingMotionState({
                compassHeading: 180,
                courseHeading: 92,
                motionState,
                nextLocation: { latitude: 30, longitude: -97 },
            }),
            {
                compassHeading: 180,
                isMoving: false,
                latitude: 30,
                longitude: -97,
                speed: 0,
            },
        );
    });

    for (const heading of [0, 45, 135, 225, 315, 359]) {
        test(`holds the last travel heading of ${heading} degrees through a stop`, () => {
            let previousLocation = getLocationWithDrivingMotionState({
                compassHeading: null,
                courseHeading: heading,
                motionState: { isMoving: true, speed: 8 },
                nextLocation: { latitude: 30, longitude: -97 },
            });

            for (const compassHeading of [180, 270, 45, null]) {
                const location = getLocationWithDrivingMotionState({
                    compassHeading,
                    courseHeading: null,
                    motionState: { isMoving: false, speed: 0 },
                    nextLocation: { latitude: 30, longitude: -97 },
                    previousLocation,
                });

                assert.equal(location.heading, heading);
                assert.equal(location.courseHeading, undefined);
                assert.equal(location.isMoving, false);
                previousLocation = location;
            }

            const resumedHeading = (heading + 90) % 360;
            const resumedLocation = getLocationWithDrivingMotionState({
                compassHeading: 180,
                courseHeading: resumedHeading,
                motionState: { isMoving: true, speed: 8 },
                nextLocation: { latitude: 30.0001, longitude: -97 },
                previousLocation,
            });

            assert.equal(resumedLocation.heading, resumedHeading);
            assert.equal(resumedLocation.courseHeading, resumedHeading);
        });
    }

    test('leaves the initial stopped direction available to the compass', () => {
        const location = getLocationWithDrivingMotionState({
            compassHeading: 135,
            courseHeading: null,
            motionState: { isMoving: false, speed: 0 },
            nextLocation: { latitude: 30, longitude: -97 },
        });

        assert.equal(location.heading, undefined);
        assert.equal(location.compassHeading, 135);
    });

    test('uses derived movement when an e2e provider reports zero speed', () => {
        const motionState = resolveDrivingMotionState({
            derivedMotion: {
                courseHeading: 90,
                speed: 12,
            },
            fallbackCourseHeading: null,
            locationCourseHeading: null,
            measuredSpeed: 0,
            minimumCourseSpeed: 1.5,
            preferDerivedMotion: true,
        });

        assert.equal(motionState.isMoving, true);
        assert.equal(motionState.speed, 12);
        assert.equal(motionState.courseHeading, 90);
    });
});
