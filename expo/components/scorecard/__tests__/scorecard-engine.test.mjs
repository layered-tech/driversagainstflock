import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    addScorecardExposure,
    applyScorecardTripGasPrice,
    createEmptyScorecardState,
    createScorecardSession,
    creditAvoidedRouteCameras,
    finalizeScorecardSession,
    getCleanDriveStreak,
    getExposureScoreImpact,
    getScorecardLevel,
    getScorecardPrivacyScore,
    getScorecardWindowStats,
    parseScorecardState,
    recordScorecardContribution,
    resetScorecardFuelCostSettings,
    SCORECARD_FIXED_MPG,
    SCORECARD_STATS_WINDOW_MS,
    serializeScorecardState,
    setScorecardFuelCostSettings,
} from '../scorecard-engine.js';

function makeRoute() {
    return {
        routes: {
            direct: {
                cameraCandidates: [
                    {
                        coordinate: [-97.74, 30.26],
                        directionKnown: true,
                        osmId: '100',
                        routeProgressFraction: 0.25,
                    },
                    {
                        coordinate: [-97.73, 30.27],
                        directionKnown: true,
                        osmId: '200',
                        routeProgressFraction: 0.75,
                    },
                    {
                        coordinate: [-97.72, 30.28],
                        directionKnown: false,
                        osmId: 'unknown',
                        routeProgressFraction: 0.5,
                    },
                ],
                cameraCoverageComplete: true,
            },
            ideal: {
                cameraCandidates: [],
                cameraCoverageComplete: true,
            },
        },
        selectedRouteKey: 'ideal',
    };
}

describe('device-local scorecard engine', () => {
    test('uses the transparent avoided-versus-confirmed-read score', () => {
        assert.equal(getScorecardPrivacyScore(41, 6), 82);
        assert.equal(getScorecardPrivacyScore(0, 0), null);
        assert.equal(getScorecardPrivacyScore(0, 2), 0);
    });

    test('credits only completed, direction-known avoided cameras once', () => {
        let session = createScorecardSession({
            id: 'drive-1',
            mode: 'guided',
            startedAt: 1,
        });
        const route = makeRoute();

        session = creditAvoidedRouteCameras(session, route, 0.5, 2);
        session = creditAvoidedRouteCameras(session, route, 0.8, 3);
        session = creditAvoidedRouteCameras(session, route, 1, 4);

        assert.deepEqual(
            session.creditedAvoidances.map(({ osmId }) => osmId),
            ['100', '200'],
        );
    });

    test('awards per-camera XP even when ALPR monitoring was unavailable', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        let session = createScorecardSession({
            exposureCoverageComplete: false,
            id: 'drive-partial-monitoring',
            mode: 'guided',
            startedAt,
        });

        session = creditAvoidedRouteCameras(session, makeRoute(), 1, startedAt);

        const { trip } = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: session,
            },
            { endedAt: startedAt + 60_000 },
        );

        assert.equal(trip.exposureCoverageComplete, false);
        assert.equal(trip.avoidedCameraCount, 2);
        assert.equal(trip.xpEarned, 90);
    });

    test('keeps stable OSM avoidance credit across reroutes', () => {
        const firstRoute = makeRoute();
        const reroute = makeRoute();
        reroute.routes.direct.cameraCandidates[0].routeProgressFraction = 0.1;
        reroute.routes.direct.cameraCandidates.push({
            coordinate: [-97.71, 30.29],
            directionKnown: true,
            osmId: '300',
            routeProgressFraction: 0.2,
        });
        let session = createScorecardSession({
            id: 'drive-1',
            mode: 'guided',
            startedAt: 1,
        });

        session = creditAvoidedRouteCameras(session, firstRoute, 0.3, 2);
        session = creditAvoidedRouteCameras(session, reroute, 0.4, 3);

        assert.deepEqual(
            session.creditedAvoidances.map(({ osmId }) => osmId),
            ['100', '300'],
        );
    });

    test('prices only extra miles using 25.2 mpg and the starting-state price', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');
        const session = createScorecardSession({
            gasPrice: 3.5,
            id: 'drive-priced',
            mode: 'guided',
            startedAt,
            startingStateCode: 'TX',
        });
        const initialState = {
            ...createEmptyScorecardState(),
            activeSession: session,
        };
        const { trip } = finalizeScorecardSession(initialState, {
            endedAt: startedAt + 600_000,
            extraDistanceMeters: 10 * 1609.344,
        });

        assert.equal(SCORECARD_FIXED_MPG, 25.2);
        assert.equal(trip.extraMiles, 10);
        assert.equal(trip.extraGallons, 10 / 25.2);
        assert.equal(trip.extraFuelCost, (10 / 25.2) * 3.5);
        assert.equal(trip.startingStateCode, 'TX');
    });

    test('backfills a late state price into the completed local trip', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');
        const initialState = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                id: 'drive-late-price',
                mode: 'guided',
                startedAt,
                startingStateCode: 'TX',
            }),
        };
        const finalized = finalizeScorecardSession(initialState, {
            endedAt: startedAt + 60_000,
            extraDistanceMeters: 5 * 1609.344,
        });
        const priced = applyScorecardTripGasPrice(
            finalized.state,
            'drive-late-price',
            {
                price: 3.25,
                retrievedAt: '2026-08-01T12:01:01Z',
                sourceAsOf: 'August 1, 2026',
            },
        );
        const expectedCost = (5 / SCORECARD_FIXED_MPG) * 3.25;

        assert.equal(finalized.trip.extraFuelCost, null);
        assert.equal(priced.trip.extraFuelCost, expectedCost);
        assert.equal(priced.trip.gasPrice, 3.25);
        assert.equal(priced.state.lifetime.extraFuelCost, expectedCost);
    });

    test('uses encrypted MPG and gas price settings for retained and future drives', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');
        const baseState = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                gasPrice: 3.5,
                id: 'drive-custom-cost',
                mode: 'guided',
                startedAt,
            }),
        };
        const finalized = finalizeScorecardSession(baseState, {
            endedAt: startedAt + 60_000,
            extraDistanceMeters: 10 * 1609.344,
        }).state;
        const customized = setScorecardFuelCostSettings(finalized, {
            fuelEconomyMpg: 50,
            gasPricePerGallon: 4,
        });
        const stats = getScorecardWindowStats(customized, startedAt + 60_000);
        const restored = resetScorecardFuelCostSettings(customized);
        const restoredStats = getScorecardWindowStats(
            restored,
            startedAt + 60_000,
        );
        const parsed = parseScorecardState(
            serializeScorecardState(customized, startedAt + 60_000),
            startedAt + 60_000,
        );
        const futureState = {
            ...customized,
            activeSession: createScorecardSession({
                gasPrice: 3.5,
                id: 'drive-future-custom-cost',
                mode: 'guided',
                startedAt: startedAt + 120_000,
            }),
        };
        const futureTrip = finalizeScorecardSession(futureState, {
            endedAt: startedAt + 180_000,
            extraDistanceMeters: 5 * 1609.344,
        }).trip;

        assert.equal(stats.extraGallons, 0.2);
        assert.equal(stats.extraFuelCost, 0.8);
        assert.equal(futureTrip.extraGallons, 0.1);
        assert.equal(futureTrip.extraFuelCost, 0.4);
        assert.equal(parsed.settings.fuelEconomyMpg, 50);
        assert.equal(parsed.settings.gasPricePerGallon, 4);
        assert.equal(restoredStats.extraGallons, 10 / SCORECARD_FIXED_MPG);
        assert.equal(
            restoredStats.extraFuelCost,
            (10 / SCORECARD_FIXED_MPG) * 3.5,
        );
    });

    test('counts consecutive clean drives instead of consecutive calendar days', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');
        const makeTrip = (offset, confirmedReadCount = 0) => ({
            confirmedReadCount,
            endedAt: startedAt + offset,
            exposureCoverageComplete: true,
        });

        assert.deepEqual(
            getCleanDriveStreak([
                makeTrip(1000),
                makeTrip(2000),
                makeTrip(3000, 1),
                makeTrip(4000),
                makeTrip(5000),
                makeTrip(6000),
            ]),
            { current: 3, longest: 3 },
        );
    });

    test('shows possible reads but excludes them from score and score impact', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                id: 'drive-possible',
                mode: 'free',
                startedAt,
            }),
        };

        state = addScorecardExposure(state, {
            cameraCoordinate: [-97.74, 30.26],
            certainty: 'possible',
            id: 'read-possible',
            occurredAt: startedAt + 1000,
            osmId: '400',
            sessionId: 'drive-possible',
        });
        state = finalizeScorecardSession(state, {
            endedAt: startedAt + 5000,
        }).state;
        const stats = getScorecardWindowStats(state, startedAt + 5000);

        assert.equal(stats.possibleReadCount, 1);
        assert.equal(stats.confirmedReadCount, 0);
        assert.equal(stats.privacyScore, null);
        assert.equal(
            getExposureScoreImpact(state, 'read-possible', startedAt + 5000),
            0,
        );
    });

    test('keeps geographic detail on device while using a 30-day stats window', () => {
        const endedAt = Date.parse('2026-06-01T12:00:00Z');
        const state = {
            ...createEmptyScorecardState(),
            exposures: [
                {
                    cameraCoordinate: [-97.74, 30.26],
                    certainty: 'confirmed',
                    id: 'read-old',
                    occurredAt: endedAt,
                    osmId: '500',
                    sessionId: 'drive-old',
                },
            ],
            lifetime: {
                ...createEmptyScorecardState().lifetime,
                avoidedCameraCount: 12,
                xp: 540,
            },
            pendingRecapTripId: 'drive-old',
            trips: [
                {
                    endedAt,
                    id: 'drive-old',
                    startedAt: endedAt - 1000,
                },
            ],
        };
        const parsed = parseScorecardState(
            serializeScorecardState(
                state,
                endedAt + SCORECARD_STATS_WINDOW_MS + 1,
            ),
            endedAt + SCORECARD_STATS_WINDOW_MS + 1,
        );
        const windowStats = getScorecardWindowStats(
            parsed,
            endedAt + SCORECARD_STATS_WINDOW_MS + 1,
        );

        assert.equal(parsed.exposures.length, 1);
        assert.equal(parsed.trips.length, 1);
        assert.equal(parsed.lifetime.avoidedCameraCount, 12);
        assert.equal(parsed.lifetime.xp, 540);
        assert.equal(parsed.pendingRecapTripId, 'drive-old');
        assert.equal(windowStats.trips.length, 0);
    });

    test('whitelists persisted fields so raw GPS and route geometry are dropped', () => {
        const now = Date.parse('2026-08-01T12:00:00Z');
        const state = {
            ...createEmptyScorecardState(),
            activeSession: {
                ...createScorecardSession({
                    id: 'drive-private',
                    mode: 'guided',
                    startedAt: now,
                }),
                destination: [-97.7, 30.3],
                rawGpsSamples: [[-97.8, 30.2]],
                routeGeometry: [[-97.8, 30.2]],
            },
            exposures: [
                {
                    cameraCoordinate: [-97.74, 30.26],
                    certainty: 'confirmed',
                    id: 'read-private',
                    occurredAt: now,
                    osmId: '600',
                    rawUserCoordinate: [-97.7401, 30.2601],
                    routeSegmentCoordinates: [
                        [-97.741, 30.259],
                        [-97.74, 30.26],
                        [-97.739, 30.261],
                    ],
                    sessionId: 'drive-private',
                },
            ],
        };
        const serialized = serializeScorecardState(state, now);

        assert.doesNotMatch(
            serialized,
            /destination|rawGpsSamples|routeGeometry|rawUserCoordinate/,
        );
        assert.deepEqual(
            parseScorecardState(serialized, now).exposures[0].cameraCoordinate,
            [-97.74, 30.26],
        );
        assert.deepEqual(
            parseScorecardState(serialized, now).exposures[0]
                .routeSegmentCoordinates,
            [
                [-97.741, 30.259],
                [-97.74, 30.26],
                [-97.739, 30.261],
            ],
        );
    });

    test('matches the designed Ghost level and Cartographer badge', () => {
        assert.deepEqual(
            {
                level: getScorecardLevel(2520).level,
                name: getScorecardLevel(2520).name,
                xpToNext: getScorecardLevel(2520).xpToNext,
            },
            { level: 4, name: 'Ghost', xpToNext: 480 },
        );

        let state = createEmptyScorecardState();

        for (let count = 0; count < 10; count += 1) {
            state = recordScorecardContribution(state, count + 1);
        }

        assert.equal(state.badgeUnlocks.cartographer, 10);
    });
});
