import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS,
    getActiveRouteDeviationDistanceMeters,
} from '../active-route-deviation.js';

describe('active route deviation', () => {
    test('uses the tightened 30-meter boundary', () => {
        assert.equal(ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS, 30);
    });

    test('uses raw GPS distance instead of the route-snapped puck distance', () => {
        assert.equal(
            getActiveRouteDeviationDistanceMeters({
                routeProgress: { distanceFromRoute: 0 },
                userLocation: {
                    roadMatch: { distanceFromActiveRouteMeters: 31 },
                },
            }),
            31,
        );
    });

    test('falls back to matched route progress without matcher metadata', () => {
        for (const distanceFromActiveRouteMeters of [undefined, null]) {
            assert.equal(
                getActiveRouteDeviationDistanceMeters({
                    routeProgress: { distanceFromRoute: 12 },
                    userLocation: {
                        roadMatch: { distanceFromActiveRouteMeters },
                    },
                }),
                12,
            );
        }
    });
});
