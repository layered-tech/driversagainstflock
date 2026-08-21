import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    addScorecardExposure,
    applyScorecardTripGasPrice,
    createEmptyScorecardState,
    createScorecardSession,
    finalizeScorecardSession,
    getAvoidableRouteCameraCandidates,
    getAvoidableRouteCameraCount,
    getCleanDriveStreak,
    getExposureScoreImpact,
    getScorecardLevel,
    getScorecardMonitoringCameraKey,
    getScorecardPrivacyScore,
    getScorecardWindowStats,
    mergeScorecardSessionRouteCatalog,
    parseScorecardState,
    recordScorecardContribution,
    resetScorecardFuelCostSettings,
    SCORECARD_CAMERA_REENTRY_DEBOUNCE_MS,
    SCORECARD_FIXED_MPG,
    SCORECARD_STATS_WINDOW_MS,
    serializeScorecardState,
    setScorecardFuelCostSettings,
    unlockEarnedScorecardBadges,
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
                distance: 1_000,
                duration: 100,
                nodeCount: 3,
                routeKey: 'direct',
            },
            ideal: {
                cameraCandidates: [],
                cameraCoverageComplete: true,
                distance: 1_200,
                duration: 130,
                monitoringCameraNodes: [
                    {
                        coordinate: [-97.71, 30.29],
                        directions: [{ end: 90, isRange: false, start: 90 }],
                        osmId: 'private-monitor',
                    },
                    {
                        coordinate: [-97.7, 30.3],
                        directions: [],
                        name: 'Monitoring-only camera',
                        osmId: null,
                    },
                ],
                nodeCount: 0,
                routeKey: 'ideal',
            },
        },
        selectedRouteKey: 'ideal',
    };
}

describe('device-local scorecard engine', () => {
    test('uses the transparent avoided-versus-camera-crossing score', () => {
        assert.equal(getScorecardPrivacyScore(41, 6), 82);
        assert.equal(getScorecardPrivacyScore(0, 0), null);
        assert.equal(getScorecardPrivacyScore(0, 2), 0);
    });

    test('matches null-ID route and supplemental cameras by normalized geometry', () => {
        assert.equal(
            getScorecardMonitoringCameraKey({
                coordinate: [-97.74, 30.26],
                directions: [{ end: 0, isRange: false, start: 0 }],
                name: 'Route presentation',
                osmId: null,
            }),
            getScorecardMonitoringCameraKey({
                coordinate: [-97.74, 30.26],
                direction: 'N',
                name: 'Supplemental presentation',
                osmId: null,
            }),
        );
    });

    test('snapshots all stable fastest-only cameras, including unknown directions', () => {
        const route = makeRoute();
        const session = createScorecardSession({
            id: 'drive-1',
            mode: 'guided',
            route,
            startedAt: 1,
        });

        assert.deepEqual(
            getAvoidableRouteCameraCandidates(route).map(({ osmId }) => osmId),
            ['100', '200', 'unknown'],
        );
        assert.deepEqual(
            session.avoidanceBaseline.map(({ osmId }) => osmId),
            ['100', '200', 'unknown'],
        );
        assert.equal(session.lockedAvoidedCameraCount, 3);
        assert.deepEqual(
            session.monitoringCameras
                .map(({ osmId }) => osmId)
                .filter(Boolean)
                .sort(),
            ['100', '200', 'private-monitor', 'unknown'],
        );
        assert.equal(session.monitoringCameras.at(-1).osmId, null);
        assert.equal(session.selectedRouteKey, 'ideal');
        assert.equal(session.initialRouteDistanceMeters, 1_200);
        assert.equal(session.initialRouteDurationSeconds, 130);
        assert.equal(session.initialDirectRouteDistanceMeters, 1_000);
        assert.equal(session.initialDirectRouteDurationSeconds, 100);
    });

    test('uses stable-ID difference when the private route substitutes a camera', () => {
        const route = makeRoute();

        route.routes.ideal.cameraCandidates = [
            route.routes.direct.cameraCandidates[1],
            {
                coordinate: [-97.7, 30.3],
                directionKnown: true,
                osmId: 'private-only',
            },
        ];
        route.routes.ideal.nodeCount = 2;

        assert.deepEqual(
            getAvoidableRouteCameraCandidates(route).map(({ osmId }) => osmId),
            ['100', 'unknown'],
        );
        assert.equal(getAvoidableRouteCameraCount(route), 1);
    });

    test('locks a fastest-only camera by ID without requiring extra metadata', () => {
        const route = makeRoute();

        route.routes.direct.cameraCandidates.push({ osmId: 'id-only' });
        route.routes.direct.nodeCount = 4;
        const session = createScorecardSession({
            id: 'drive-id-only-camera',
            mode: 'guided',
            route,
            startedAt: 1,
        });
        const { trip } = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: session,
            },
            { completion: 'arrival', endedAt: 60_001 },
        );

        assert.equal(session.avoidanceBaseline.at(-1).osmId, 'id-only');
        assert.equal(trip.avoidedCameraCount, 4);
        assert.equal(trip.xpEarned, 180);
    });

    test('locks the visible route-count difference when a camera has no stable ID', () => {
        const route = makeRoute();

        route.routes.direct.nodeCount = 4;
        const session = createScorecardSession({
            id: 'drive-id-less-camera',
            mode: 'guided',
            route,
            startedAt: 1,
        });
        const { trip } = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: session,
            },
            { completion: 'arrival', endedAt: 60_001 },
        );

        assert.equal(session.avoidanceBaseline.length, 3);
        assert.equal(session.lockedAvoidedCameraCount, 4);
        assert.equal(trip.avoidedCameraCount, 4);
        assert.equal(trip.avoidedCameras.length, 3);
        assert.equal(trip.xpEarned, 180);
    });

    test('awards no avoidance when the initial fastest route is selected', () => {
        const route = makeRoute();

        route.selectedRouteKey = 'direct';
        const session = createScorecardSession({
            id: 'drive-direct',
            mode: 'guided',
            route,
            startedAt: 1,
        });
        const finalized = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: session,
            },
            { completion: 'arrival', endedAt: 60_001 },
        );

        assert.deepEqual(session.avoidanceBaseline, []);
        assert.equal(finalized.trip.avoidedCameraCount, 0);
        assert.equal(finalized.trip.xpEarned, 0);
    });

    test('awards the start-time baseline without checking route inventory coverage', () => {
        const route = makeRoute();
        route.routes.direct.cameraCoverageComplete = false;
        route.routes.ideal.cameraCoverageComplete = false;
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        const session = createScorecardSession({
            id: 'drive-incomplete-route-coverage',
            mode: 'guided',
            route,
            startedAt,
        });
        const { trip } = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: session,
            },
            { completion: 'arrival', endedAt: startedAt + 60_000 },
        );

        assert.deepEqual(
            trip.avoidedCameras.map(({ osmId }) => osmId),
            ['100', '200', 'unknown'],
        );
        assert.equal(trip.xpEarned, 135);
    });

    test('uses the guided start snapshot without supplemental scoring metadata', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        const session = createScorecardSession({
            id: 'drive-partial-monitoring',
            mode: 'guided',
            route: makeRoute(),
            startedAt,
        });

        const { state, trip } = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: session,
            },
            { completion: 'arrival', endedAt: startedAt + 60_000 },
        );
        assert.equal(trip.avoidedCameraCount, 3);
        assert.equal(trip.xpEarned, 135);
        assert.equal(state.lifetime.cleanDriveCount, 1);
        assert.equal(state.lifetime.currentCleanDriveStreak, 1);
        assert.equal(
            getScorecardWindowStats(state, startedAt + 60_000).privacyScore,
            100,
        );
    });

    test('merges reroute monitoring cameras without changing the initial baseline', () => {
        const firstRoute = makeRoute();
        const reroute = makeRoute();
        reroute.routes.direct.cameraCandidates.push({
            coordinate: [-97.71, 30.29],
            directionKnown: true,
            osmId: '300',
            routeProgressFraction: 0.2,
        });
        const session = createScorecardSession({
            id: 'drive-1',
            mode: 'guided',
            route: firstRoute,
            startedAt: 1,
        });
        const reroutedSession = mergeScorecardSessionRouteCatalog(
            session,
            reroute,
        );

        assert.deepEqual(
            reroutedSession.avoidanceBaseline.map(({ osmId }) => osmId),
            ['100', '200', 'unknown'],
        );
        assert.deepEqual(
            reroutedSession.monitoringCameras
                .map(({ osmId }) => osmId)
                .filter(Boolean)
                .sort(),
            ['100', '200', '300', 'private-monitor', 'unknown'],
        );
        assert.equal(
            mergeScorecardSessionRouteCatalog(reroutedSession, reroute),
            reroutedSession,
        );
    });

    test('keeps exposure penalties separate from the locked avoidance award', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                id: 'drive-exposed-baseline',
                mode: 'guided',
                route: makeRoute(),
                startedAt,
            }),
        };

        for (const [osmId, certainty] of [
            ['100', 'confirmed'],
            ['unknown', 'possible'],
        ]) {
            state = addScorecardExposure(state, {
                cameraCoordinate: [-97.74, 30.26],
                certainty,
                id: `read-${osmId}`,
                occurredAt: startedAt + 1_000,
                osmId,
                sessionId: 'drive-exposed-baseline',
            });
        }

        const finalized = finalizeScorecardSession(state, {
            completion: 'arrival',
            endedAt: startedAt + 60_000,
        });

        assert.deepEqual(
            finalized.trip.avoidedCameras.map(({ osmId }) => osmId),
            ['100', '200', 'unknown'],
        );
        assert.equal(finalized.trip.confirmedReadCount, 1);
        assert.equal(finalized.trip.possibleReadCount, 1);
        assert.equal(finalized.trip.xpEarned, 135);
        assert.equal(finalized.state.lifetime.xp, 135);
    });

    test('retains the two-minute camera debounce across encrypted relaunches', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                id: 'drive-relaunch-debounce',
                mode: 'guided',
                route: makeRoute(),
                startedAt,
            }),
        };
        const exposure = {
            cameraCoordinate: [-97.74, 30.26],
            cameraDirections: [{ end: 90, isRange: false, start: 90 }],
            certainty: 'confirmed',
            id: 'read-before-relaunch',
            occurredAt: startedAt + 1_000,
            osmId: '100',
            sessionId: 'drive-relaunch-debounce',
        };

        state = addScorecardExposure(state, exposure);
        state = parseScorecardState(
            serializeScorecardState(state, startedAt + 2_000),
            startedAt + 2_000,
        );
        const immediateReentry = addScorecardExposure(state, {
            ...exposure,
            id: 'read-immediate-reentry',
            occurredAt:
                exposure.occurredAt + SCORECARD_CAMERA_REENTRY_DEBOUNCE_MS - 1,
        });
        const validReentry = addScorecardExposure(state, {
            ...exposure,
            id: 'read-valid-reentry',
            occurredAt:
                exposure.occurredAt + SCORECARD_CAMERA_REENTRY_DEBOUNCE_MS,
        });

        assert.equal(immediateReentry, state);
        assert.equal(validReentry.exposures.length, 2);
    });

    test('awards the locked baseline when the user ends a guided route', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            lifetime: {
                ...createEmptyScorecardState().lifetime,
                currentCleanDriveStreak: 4,
                longestCleanDriveStreak: 4,
            },
            activeSession: createScorecardSession({
                id: 'drive-manually-ended',
                mode: 'guided',
                route: makeRoute(),
                startedAt,
            }),
        };
        state = addScorecardExposure(state, {
            cameraCoordinate: [-97.74, 30.26],
            certainty: 'possible',
            id: 'read-manually-ended',
            occurredAt: startedAt + 1_000,
            osmId: '100',
            sessionId: 'drive-manually-ended',
        });

        const finalized = finalizeScorecardSession(state, {
            completion: 'manual',
            distanceMeters: 1_000,
            endedAt: startedAt + 60_000,
        });

        assert.equal(finalized.trip.completed, true);
        assert.equal(finalized.trip.distanceMiles, 1_000 / 1609.344);
        assert.equal(finalized.trip.possibleReadCount, 1);
        assert.equal(finalized.trip.avoidedCameraCount, 3);
        assert.equal(finalized.trip.xpEarned, 135);
        assert.equal(finalized.state.lifetime.completedDriveCount, 1);
        assert.equal(finalized.state.lifetime.cleanDriveCount, 0);
        assert.equal(finalized.state.lifetime.currentCleanDriveStreak, 0);
        assert.equal(finalized.state.lifetime.possibleReadCount, 1);
    });

    test('does not award the locked baseline when guidance ends early', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        const finalized = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: createScorecardSession({
                    id: 'drive-ended-early',
                    mode: 'guided',
                    route: makeRoute(),
                    startedAt,
                }),
            },
            { completion: 'cancelled', endedAt: startedAt + 60_000 },
        );

        assert.equal(finalized.trip.completed, false);
        assert.equal(finalized.trip.avoidedCameraCount, 0);
        assert.equal(finalized.trip.xpEarned, 0);
        assert.equal(finalized.state.lifetime.completedDriveCount, 0);
        assert.equal(finalized.state.lifetime.avoidedCameraCount, 0);
    });

    test('keeps a paused guided trip incomplete without resetting its streak', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        const initialState = createEmptyScorecardState();
        const finalized = finalizeScorecardSession(
            {
                ...initialState,
                activeSession: createScorecardSession({
                    id: 'drive-paused',
                    mode: 'guided',
                    route: makeRoute(),
                    startedAt,
                }),
                lifetime: {
                    ...initialState.lifetime,
                    currentCleanDriveStreak: 3,
                    longestCleanDriveStreak: 3,
                },
            },
            { completion: 'paused', endedAt: startedAt + 60_000 },
        );

        assert.equal(finalized.trip.completed, false);
        assert.equal(finalized.trip.avoidedCameraCount, 0);
        assert.equal(finalized.trip.xpEarned, 0);
        assert.equal(finalized.state.lifetime.completedDriveCount, 0);
        assert.equal(finalized.state.lifetime.currentCleanDriveStreak, 3);
    });

    test('atomically finalizes XP, badges, lifetime totals, and active-session removal', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        const finalized = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: createScorecardSession({
                    id: 'drive-atomic-arrival',
                    mode: 'guided',
                    route: makeRoute(),
                    startedAt,
                }),
            },
            { completion: 'arrival', endedAt: startedAt + 60_000 },
        );

        assert.equal(finalized.state.activeSession, null);
        assert.equal(finalized.trip.xpEarned, 135);
        assert.equal(finalized.state.lifetime.xp, 135);
        assert.equal(finalized.state.lifetime.avoidedCameraCount, 3);
        assert.equal(finalized.state.lifetime.completedDriveCount, 1);
        assert.equal(finalized.state.lifetime.privateTripsWithAvoidance, 1);
        assert.equal(
            finalized.state.badgeUnlocks['first-detour'],
            startedAt + 60_000,
        );
    });

    test('treats explicit free-drive manual completion as successful', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        const finalized = finalizeScorecardSession(
            {
                ...createEmptyScorecardState(),
                activeSession: createScorecardSession({
                    id: 'drive-free',
                    mode: 'free',
                    startedAt,
                }),
            },
            { completion: 'manual', endedAt: startedAt + 60_000 },
        );

        assert.equal(finalized.trip.completed, true);
        assert.equal(finalized.state.lifetime.completedDriveCount, 1);
        assert.equal(finalized.state.lifetime.cleanDriveCount, 1);
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
        const makeTrip = (
            offset,
            confirmedReadCount = 0,
            possibleReadCount = 0,
        ) => ({
            confirmedReadCount,
            endedAt: startedAt + offset,
            possibleReadCount,
        });

        assert.deepEqual(
            getCleanDriveStreak([
                makeTrip(1000),
                makeTrip(2000),
                makeTrip(3000, 1),
                makeTrip(4000),
                makeTrip(5000, 0, 1),
                makeTrip(6000),
            ]),
            { current: 1, longest: 2 },
        );
    });

    test('counts every completed drive with no camera crossings', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');

        assert.deepEqual(
            getCleanDriveStreak([
                {
                    confirmedReadCount: 0,
                    endedAt: startedAt,
                },
                {
                    confirmedReadCount: 0,
                    endedAt: startedAt + 1000,
                },
            ]),
            { current: 2, longest: 2 },
        );
    });

    test('earns no-crossing badges from completed game results', () => {
        const now = Date.parse('2026-08-30T12:00:00Z');
        const state = {
            ...createEmptyScorecardState(),
            trips: Array.from({ length: 10 }, (_, index) => ({
                confirmedReadCount: 0,
                endedAt: now - (index * (29 * 24 * 60 * 60 * 1000)) / 9,
                id: `drive-${index}`,
                possibleReadCount: 0,
                startedAt:
                    now - (index * (29 * 24 * 60 * 60 * 1000)) / 9 - 1000,
            })),
        };
        const awarded = unlockEarnedScorecardBadges(state, now);

        assert.equal(awarded.badgeUnlocks['clean-week'], now);
        assert.equal(awarded.badgeUnlocks['zero-month'], now);
    });

    test('scores every detected camera crossing regardless of direction metadata', () => {
        const startedAt = Date.parse('2026-08-01T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                id: 'drive-possible',
                mode: 'guided',
                route: makeRoute(),
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
            completion: 'arrival',
            endedAt: startedAt + 5000,
        }).state;
        const stats = getScorecardWindowStats(state, startedAt + 5000);

        assert.equal(stats.possibleReadCount, 1);
        assert.equal(stats.confirmedReadCount, 0);
        assert.equal(stats.privacyScore, 67);
        assert.equal(
            getExposureScoreImpact(state, 'read-possible', startedAt + 5000),
            -33,
        );
    });

    test('persists monitoring-only exposure events without fabricating an OSM ID', () => {
        const startedAt = Date.parse('2026-08-12T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            activeSession: createScorecardSession({
                id: 'drive-monitoring-only',
                mode: 'free',
                startedAt,
            }),
        };

        state = addScorecardExposure(state, {
            cameraCoordinate: [-97.74, 30.26],
            certainty: 'possible',
            id: 'read-monitoring-only',
            label: 'Monitoring-only camera',
            occurredAt: startedAt + 1_000,
            osmId: null,
            sessionId: 'drive-monitoring-only',
        });
        const restored = parseScorecardState(
            serializeScorecardState(state, startedAt + 2_000),
            startedAt + 2_000,
        );

        assert.equal(restored.exposures.length, 1);
        assert.equal(restored.exposures[0].osmId, null);
        assert.equal(restored.exposures[0].label, 'Monitoring-only camera');
    });

    test('prunes geographic detail after 30 days while preserving lifetime totals', () => {
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

        assert.equal(parsed.exposures.length, 0);
        assert.equal(parsed.trips.length, 0);
        assert.equal(parsed.lifetime.avoidedCameraCount, 12);
        assert.equal(parsed.lifetime.xp, 540);
        assert.equal(parsed.pendingRecapTripId, null);
        assert.equal(windowStats.trips.length, 0);
    });

    test('expires stale active-session geography as an incomplete trip', () => {
        const startedAt = Date.parse('2026-06-01T12:00:00Z');
        let state = {
            ...createEmptyScorecardState(),
            activeSession: {
                ...createScorecardSession({
                    id: 'drive-stale-active',
                    mode: 'guided',
                    route: makeRoute(),
                    startedAt,
                }),
                completedDistanceMeters: 800,
            },
        };

        state = addScorecardExposure(state, {
            cameraCoordinate: [-97.74, 30.26],
            certainty: 'confirmed',
            id: 'read-stale-active',
            occurredAt: startedAt + 1_000,
            osmId: '100',
            sessionId: 'drive-stale-active',
        });
        const now = startedAt + SCORECARD_STATS_WINDOW_MS + 2_001;
        const serialized = serializeScorecardState(state, now);
        const restored = parseScorecardState(serialized, now);

        assert.equal(restored.activeSession, null);
        assert.equal(restored.exposures.length, 0);
        assert.equal(restored.trips.length, 1);
        assert.equal(restored.trips[0].completed, false);
        assert.equal(restored.trips[0].completion, 'paused');
        assert.equal(restored.trips[0].distanceMiles, 800 / 1609.344);
        assert.equal(restored.trips[0].avoidedCameraCount, 0);
        assert.equal(restored.lifetime.completedDriveCount, 0);
        assert.equal(restored.lifetime.confirmedReadCount, 1);
        assert.doesNotMatch(serialized, /monitoringCameras|avoidanceBaseline/);
        assert.doesNotMatch(serialized, /cameraCoordinate/);
    });

    test('whitelists persisted fields so raw GPS and route geometry are dropped', () => {
        const now = Date.parse('2026-08-01T12:00:00Z');
        const state = {
            ...createEmptyScorecardState(),
            activeSession: {
                ...createScorecardSession({
                    id: 'drive-private',
                    mode: 'guided',
                    route: makeRoute(),
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
        const restoredSession = parseScorecardState(
            serialized,
            now,
        ).activeSession;

        assert.deepEqual(
            restoredSession.avoidanceBaseline.map(({ osmId }) => osmId),
            ['100', '200', 'unknown'],
        );
        assert.equal(restoredSession.lockedAvoidedCameraCount, 3);
        assert.equal(restoredSession.monitoringCameras.length, 5);
        assert.equal(restoredSession.selectedRouteKey, 'ideal');
        assert.equal(restoredSession.initialRouteDistanceMeters, 1_200);
        assert.equal(restoredSession.initialDirectRouteDistanceMeters, 1_000);

        const legacySession = parseScorecardState(
            JSON.stringify({
                ...createEmptyScorecardState(),
                activeSession: {
                    id: 'legacy-guided-drive',
                    mode: 'guided',
                    startedAt: now,
                },
            }),
            now,
        ).activeSession;

        assert.deepEqual(legacySession.avoidanceBaseline, []);
        assert.equal(legacySession.lockedAvoidedCameraCount, 0);
        assert.deepEqual(legacySession.monitoringCameras, []);
        assert.deepEqual(
            parseScorecardState(serialized, now).exposures[0].cameraCoordinate,
            [-97.74, 30.26],
        );
        assert.deepEqual(
            parseScorecardState(serialized, now).exposures[0]
                .routeSegmentCoordinates,
            [],
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
