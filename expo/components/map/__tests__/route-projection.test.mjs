import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as routeProjection from '../route-projection.js';
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

    test('prepares an unchanged route once across consumers and rebuilds replacements', () => {
        let coordinateReads = 0;
        const coordinates = Array.from({ length: 2000 }, (_, index) => ({
            get longitude() {
                coordinateReads += 1;
                return -97.75 + index * 0.0001;
            },
            latitude: 30.2672,
        }));
        const path = routeProjection.getRouteProjectionPath(coordinates);
        const initialReads = coordinateReads;

        for (let sample = 0; sample < 30; sample += 1) {
            assert.equal(
                routeProjection.getRouteProjectionPath(coordinates),
                path,
            );
            projectCoordinateOntoRoute(coordinates, [-97.74, 30.2672]);
        }

        assert.equal(coordinateReads, initialReads);
        const replacementCoordinates = [...coordinates, [-97.5, 30.2672]];
        const replacementPath = routeProjection.getRouteProjectionPath(
            replacementCoordinates,
        );
        assert.notEqual(replacementPath, path);
        assert.equal(
            replacementPath.coordinates.length,
            coordinates.length + 1,
        );
        assert.equal(path.coordinates.length, coordinates.length);
    });

    test('keeps the explicit builder fresh for mutable, unfinished paths', () => {
        const coordinates = [
            [0, 0],
            [0.001, 0],
        ];
        const path = createRouteProjectionPath(coordinates);
        coordinates.push([0.002, 0]);

        assert.equal(
            createRouteProjectionPath(coordinates).coordinates.length,
            3,
        );
        assert.equal(path.coordinates.length, 2);
    });

    test('retains validated coordinate precision and projects across the dateline', () => {
        const coordinates = [
            [179.9, 10],
            [-179.9, 10],
        ];
        const path = routeProjection.getRouteProjectionPath(coordinates);
        const projection = projectCoordinateOntoRoute(path, [180, 10]);

        assert.deepEqual(path.coordinates, coordinates);
        assert.equal(path.spatialIndex, null);
        assert.ok(projection.distanceAlongRouteMeters > 10000);
        assert.ok(projection.distanceAlongRouteMeters < 12000);
        assert.ok(
            Math.abs(Math.abs(projection.coordinate[0]) - 180) < 0.000001,
        );
        assert.deepEqual(
            createRouteProjectionPath([
                [-97.7231, 30],
                [181, 30],
                [' ', 30],
                [-180, 90],
            ]).coordinates,
            [
                [-97.7231, 30],
                [-180, 90],
            ],
        );
    });

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
