import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { updateScorecardArrivalDetection } from '../arrival-detection.js';

function location(timestamp, longitude = 0, latitude = 0, accuracy = 5) {
    return {
        coords: { accuracy, latitude, longitude },
        timestamp,
    };
}

describe('guided route arrival detection', () => {
    test('requires two qualified fixes over three seconds near route completion', () => {
        const first = updateScorecardArrivalDetection({
            destinationCoordinate: [0, 0],
            location: location(1000),
            routeDistanceMeters: 1000,
            routeProgress: {
                alongRouteDistance: 950,
                distanceFromRoute: 4,
            },
        });
        const second = updateScorecardArrivalDetection({
            destinationCoordinate: [0, 0],
            location: location(4000),
            routeDistanceMeters: 1000,
            routeProgress: {
                alongRouteDistance: 960,
                distanceFromRoute: 3,
            },
            state: first.state,
        });

        assert.equal(first.arrived, false);
        assert.equal(second.arrived, true);
    });

    test('treats the route endpoint as the destination when its coordinate is farther away', () => {
        const first = updateScorecardArrivalDetection({
            destinationCoordinate: [0, 0.001],
            location: location(1000),
            routeDistanceMeters: 1000,
            routeProgress: {
                alongRouteDistance: 980,
                distanceFromRoute: 4,
            },
        });
        const second = updateScorecardArrivalDetection({
            destinationCoordinate: [0, 0.001],
            location: location(4000),
            routeDistanceMeters: 1000,
            routeProgress: {
                alongRouteDistance: 980,
                distanceFromRoute: 3,
            },
            state: first.state,
        });

        assert.equal(first.arrived, false);
        assert.equal(second.arrived, true);
    });

    test('does not treat a location short of the route endpoint as an arrival', () => {
        assert.deepEqual(
            updateScorecardArrivalDetection({
                destinationCoordinate: [0, 0.001],
                location: location(1000),
                routeDistanceMeters: 1000,
                routeProgress: {
                    alongRouteDistance: 950,
                    distanceFromRoute: 4,
                },
            }),
            { arrived: false, state: null },
        );
    });

    test('resets when the fix is early, off route, or inaccurate', () => {
        for (const input of [
            {
                location: location(1000),
                routeProgress: {
                    alongRouteDistance: 800,
                    distanceFromRoute: 2,
                },
            },
            {
                location: location(1000),
                routeProgress: {
                    alongRouteDistance: 950,
                    distanceFromRoute: 120,
                },
            },
            {
                location: location(1000, 0, 0, 75),
                routeProgress: {
                    alongRouteDistance: 950,
                    distanceFromRoute: 2,
                },
            },
            {
                location: location(1000, 181),
                routeProgress: {
                    alongRouteDistance: 950,
                    distanceFromRoute: 2,
                },
            },
        ]) {
            assert.deepEqual(
                updateScorecardArrivalDetection({
                    destinationCoordinate: [0, 0],
                    routeDistanceMeters: 1000,
                    ...input,
                }),
                { arrived: false, state: null },
            );
        }
    });
});
