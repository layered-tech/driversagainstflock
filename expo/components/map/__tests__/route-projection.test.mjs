import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createRouteProjectionPath,
    getRemainingRouteWaypoints,
    projectCoordinateOntoRoute,
} from '../route-projection.js';

describe('shared route projection', () => {
    const crossingRoute = [
        [-97.744, 30.266],
        [-97.742, 30.268],
        [-97.742, 30.266],
        [-97.744, 30.268],
    ];

    test('uses prior progress to keep an ambiguous crossing on the same leg', () => {
        const path = createRouteProjectionPath(crossingRoute);
        const crossing = [-97.743, 30.267];
        const earlyProjection = projectCoordinateOntoRoute(path, crossing, {
            previousDistanceAlongRouteMeters: 100,
        });
        const lateProjection = projectCoordinateOntoRoute(path, crossing, {
            previousDistanceAlongRouteMeters: 500,
        });

        assert.ok(earlyProjection.distanceAlongRouteMeters < 300);
        assert.ok(lateProjection.distanceAlongRouteMeters > 300);
    });

    test('removes only waypoints already passed on the route', () => {
        const path = createRouteProjectionPath([
            [-97.7431, 30.2672],
            [-97.7421, 30.2672],
            [-97.7411, 30.2672],
            [-97.7401, 30.2672],
        ]);
        const firstStop = {
            id: 'first',
            location: { latitude: 30.2672, longitude: -97.7421 },
        };
        const secondStop = {
            id: 'second',
            location: { latitude: 30.2672, longitude: -97.7401 },
        };

        assert.deepEqual(
            getRemainingRouteWaypoints({
                path,
                progressDistanceMeters: 150,
                waypoints: [firstStop, secondStop],
            }),
            [secondStop],
        );
    });

    test('uses the indexed candidate segments for nearby bounded projections', () => {
        const coordinates = Array.from({ length: 240 }, (_, index) => [
            -97.75 + index * 0.0001,
            30.2672,
        ]);
        const path = createRouteProjectionPath(coordinates);
        const target = coordinates.at(-12);
        const exhaustiveProjection = projectCoordinateOntoRoute(path, target);
        const boundedProjection = projectCoordinateOntoRoute(path, target, {
            maximumDistanceFromRouteMeters: 100,
        });

        assert.ok(path.spatialIndex);
        assert.ok(
            boundedProjection.candidateSegmentCount < path.segments.length,
        );
        assert.equal(
            boundedProjection.segmentIndex,
            exhaustiveProjection.segmentIndex,
        );
        assert.ok(boundedProjection.distanceFromRouteMeters < 1);
    });
});
