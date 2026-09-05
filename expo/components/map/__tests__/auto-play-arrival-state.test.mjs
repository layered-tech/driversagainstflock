import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createAutoPlayArrivalDetector } from '../../auto-play-arrival-state.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

describe('Auto Play arrival state', () => {
    test('requires consecutive destination fixes and reports once', () => {
        const detector = createAutoPlayArrivalDetector({
            arrivalRadiusMeters: 35,
            hysteresisRadiusMeters: 55,
            requiredFixes: 3,
        });

        detector.beginRoute(7);

        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 34,
                routeDistanceRemainingMeters: 90,
                routeGeneration: 7,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 44,
                routeDistanceRemainingMeters: 70,
                routeGeneration: 7,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 31,
                routeDistanceRemainingMeters: 45,
                routeGeneration: 7,
            }),
            true,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 10,
                routeDistanceRemainingMeters: 10,
                routeGeneration: 7,
            }),
            false,
        );
    });

    test('resets confirmation outside hysteresis without accepting stale routes', () => {
        const detector = createAutoPlayArrivalDetector({
            arrivalRadiusMeters: 35,
            hysteresisRadiusMeters: 55,
            requiredFixes: 2,
        });

        detector.beginRoute(10);
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 20,
                routeDistanceRemainingMeters: 50,
                routeGeneration: 10,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 56,
                routeDistanceRemainingMeters: 40,
                routeGeneration: 10,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 30,
                routeDistanceRemainingMeters: 30,
                routeGeneration: 9,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 54,
                routeDistanceRemainingMeters: 25,
                routeGeneration: 10,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 30,
                routeDistanceRemainingMeters: 20,
                routeGeneration: 10,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 50,
                routeDistanceRemainingMeters: 15,
                routeGeneration: 10,
            }),
            true,
        );

        detector.beginRoute(11);
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 25,
                routeDistanceRemainingMeters: 20,
                routeGeneration: 10,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 25,
                routeDistanceRemainingMeters: 20,
                routeGeneration: 11,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 45,
                routeDistanceRemainingMeters: 10,
                routeGeneration: 11,
            }),
            true,
        );
    });

    test('does not arrive when the route passes near its destination early', () => {
        const detector = createAutoPlayArrivalDetector({ requiredFixes: 2 });

        detector.beginRoute(12);
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 20,
                routeDistanceRemainingMeters: 800,
                routeGeneration: 12,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 18,
                routeDistanceRemainingMeters: 760,
                routeGeneration: 12,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 25,
                routeDistanceRemainingMeters: 80,
                routeGeneration: 12,
            }),
            false,
        );
        assert.equal(
            detector.recordLocation({
                distanceToDestinationMeters: 30,
                routeDistanceRemainingMeters: 60,
                routeGeneration: 12,
            }),
            true,
        );
    });

    test('scopes real-location arrival to the active canonical stop', () => {
        assert.match(
            autoPlaySource,
            /function startAutoPlayNavigation[\s\S]*?autoPlayArrivalDetector\.beginRoute\(routeGeneration\)/,
        );
        assert.match(
            autoPlaySource,
            /function updateNavigationGuidance[\s\S]*?getAutoPlayDestinationDistanceMeters\([\s\S]*?autoPlayArrivalDetector\.recordLocation\([\s\S]*?expectedRouteGeneration:\s*routeGeneration/,
        );
        assert.match(
            autoPlaySource,
            /async function stopAutoPlayNavigation[\s\S]*?expectedRouteGeneration[\s\S]*?navigationRouteGeneration \+= 1[\s\S]*?autoPlayArrivalDetector\.reset\(\)/,
        );
    });
});
