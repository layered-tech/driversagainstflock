import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getLocationWithDrivingMotionState } from '../driving-location-state.js';

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
});
