import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getScorecardRouteDistanceSnapshot,
    getScorecardRouteProgressFraction,
    scorecardRouteEndedAtDestination,
} from '../scorecard-route-progress.js';

function route() {
    return {
        destination: {
            location: {
                latitude: 30.301,
                longitude: -97.7,
            },
        },
        routes: {
            direct: {
                coordinates: [
                    [-97.8, 30.2],
                    [-97.7, 30.3],
                ],
                distance: 10000,
                duration: 900,
                routeKey: 'direct',
            },
            ideal: {
                coordinates: [
                    [-97.8, 30.2],
                    [-97.75, 30.25],
                    [-97.7, 30.3],
                ],
                distance: 11126.54,
                duration: 1320,
                routeKey: 'ideal',
            },
        },
        selectedRouteKey: 'ideal',
    };
}

describe('scorecard route progress accounting', () => {
    test('preserves private-route distance and duration cost', () => {
        const snapshot = getScorecardRouteDistanceSnapshot(route(), 0.5);

        assert.ok(Math.abs(snapshot.extraDistanceMeters - 1126.54) < 0.001);
        assert.equal(snapshot.extraDurationSeconds, 420);
        assert.equal(snapshot.progressFraction, 0.5);
        assert.deepEqual(snapshot.destinationCoordinate, [-97.7, 30.301]);
        assert.ok(snapshot.geometryDistanceMeters > 0);
    });

    test('measures route completion against geometry instead of reported distance', () => {
        const snapshot = getScorecardRouteDistanceSnapshot(route());

        assert.equal(
            getScorecardRouteProgressFraction(snapshot, {
                alongRouteDistance: snapshot.geometryDistanceMeters,
            }),
            1,
        );
        assert.ok(
            getScorecardRouteProgressFraction(snapshot, {
                alongRouteDistance: snapshot.geometryDistanceMeters * 0.5,
            }) < 0.51,
        );
    });

    test('recognizes a manual end at the route destination without trusting reported progress', () => {
        const snapshot = getScorecardRouteDistanceSnapshot(route(), 0.35);

        assert.equal(
            scorecardRouteEndedAtDestination(snapshot, [-97.7, 30.3]),
            true,
        );
        assert.equal(
            scorecardRouteEndedAtDestination(snapshot, [-97.7, 30.301]),
            true,
        );
        assert.equal(
            scorecardRouteEndedAtDestination(snapshot, [-97.75, 30.25]),
            false,
        );
        assert.equal(
            scorecardRouteEndedAtDestination(snapshot, [181, 0]),
            false,
        );
    });
});
