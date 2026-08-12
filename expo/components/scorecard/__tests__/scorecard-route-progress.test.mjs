import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getScorecardRouteDistanceSnapshot,
    scorecardRouteHasReachedEnd,
} from '../scorecard-route-progress.js';

function route() {
    return {
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
    });

    test('recognizes teardown at the routed endpoint as arrival', () => {
        const snapshot = getScorecardRouteDistanceSnapshot(route(), 0.998);

        assert.equal(scorecardRouteHasReachedEnd(snapshot), true);
        assert.equal(
            scorecardRouteHasReachedEnd({
                ...snapshot,
                progressFraction: 0.99,
            }),
            false,
        );
    });
});
