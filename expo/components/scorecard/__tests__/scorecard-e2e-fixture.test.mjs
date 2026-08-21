import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createE2EScorecardFixture,
    E2E_SCORECARD_IDS,
    E2E_SCORECARD_LEVEL_FIXTURES,
    getE2EScorecardFixtureFromURL,
} from '../scorecard-e2e-fixture.js';
import {
    getScorecardLevel,
    getScorecardWindowStats,
    SCORECARD_BADGES,
    SCORECARD_LEVELS,
    serializeScorecardState,
} from '../scorecard-engine.js';

describe('scorecard Maestro fixture', () => {
    test('accepts only the explicit E2E mock deep link', () => {
        const fixtureNames = [
            'arrival',
            'arrival-exposed',
            'badges-all',
            'price-unavailable',
            'populated',
            ...E2E_SCORECARD_LEVEL_FIXTURES,
        ];

        for (const fixtureName of fixtureNames) {
            assert.equal(
                getE2EScorecardFixtureFromURL(
                    `driversagainstflock://e2e-mocks?scorecard=${fixtureName}`,
                ),
                fixtureName,
            );
            assert.equal(
                getE2EScorecardFixtureFromURL(
                    `driversagainstflock://scorecard?e2eScorecardFixture=${fixtureName}`,
                ),
                fixtureName,
            );
        }
        assert.equal(
            getE2EScorecardFixtureFromURL(
                'https://driversagainstflock.com/e2e-mocks?scorecard=populated',
            ),
            null,
        );
        assert.equal(
            getE2EScorecardFixtureFromURL(
                'driversagainstflock://scorecard?scorecard=populated',
            ),
            null,
        );
        assert.equal(
            getE2EScorecardFixtureFromURL(
                'driversagainstflock://e2e-mocks?scorecard=unknown',
            ),
            null,
        );
    });

    test('builds a representative sparse local scorecard', () => {
        const now = Date.parse('2026-08-10T18:00:00Z');
        const fixture = createE2EScorecardFixture('populated', now);
        const stats = getScorecardWindowStats(fixture.state, now);
        const serialized = serializeScorecardState(fixture.state, now);

        assert.equal(stats.avoidedCameraCount, 27);
        assert.equal(stats.confirmedReadCount, 2);
        assert.equal(stats.possibleReadCount, 1);
        assert.equal(stats.cameraCrossingCount, 3);
        assert.equal(stats.privacyScore, 86);
        assert.equal(fixture.state.exposures.length, 3);
        assert.equal(fixture.state.lifetime.xp, 2520);
        assert.equal(fixture.pendingRecap, null);
        assert.doesNotMatch(
            serialized,
            /rawGps|rawUser|origin|destination|routeGeometry/,
        );
    });

    test('provides clean, exposed, and unpriced arrival states', () => {
        const now = Date.parse('2026-08-10T18:00:00Z');
        const clean = createE2EScorecardFixture('arrival', now);
        const exposed = createE2EScorecardFixture('arrival-exposed', now);
        const unpriced = createE2EScorecardFixture('price-unavailable', now);
        const unpricedStats = getScorecardWindowStats(unpriced.state, now);

        assert.equal(clean.pendingRecap.id, E2E_SCORECARD_IDS.arrivalTrip);
        assert.equal(clean.pendingRecap.confirmedReadCount, 0);
        assert.equal(clean.pendingRecap.xpEarned, 360);
        assert.equal(exposed.pendingRecap.id, E2E_SCORECARD_IDS.exposedTrip);
        assert.equal(exposed.pendingRecap.confirmedReadCount, 2);
        assert.equal(exposed.pendingRecap.possibleReadCount, 1);
        assert.equal(exposed.pendingRecap.xpEarned, 540);
        assert.equal(unpriced.pendingRecap.id, E2E_SCORECARD_IDS.unpricedTrip);
        assert.equal(unpriced.pendingRecap.extraFuelCost, null);
        assert.equal(unpriced.pendingRecap.xpEarned, 180);
        assert.equal(unpricedStats.allDetourCostsPriced, false);
        assert.equal(unpricedStats.privacyScore, 84);
    });

    test('covers every level threshold and maximum-level state', () => {
        const now = Date.parse('2026-08-10T18:00:00Z');

        for (const level of SCORECARD_LEVELS) {
            const fixture = createE2EScorecardFixture(
                `level-${level.level}`,
                now,
            );
            const resolvedLevel = getScorecardLevel(fixture.state.lifetime.xp);

            assert.equal(fixture.state.lifetime.xp, level.threshold);
            assert.equal(resolvedLevel.level, level.level);
            assert.equal(resolvedLevel.name, level.name);
        }

        const maximumLevelFixture = createE2EScorecardFixture('level-8', now);

        assert.equal(
            getScorecardLevel(maximumLevelFixture.state.lifetime.xp).nextLevel,
            null,
        );
    });

    test('earns every badge through its real product condition', () => {
        const now = Date.parse('2026-08-10T18:00:00Z');
        const fixture = createE2EScorecardFixture('badges-all', now);

        assert.deepEqual(
            Object.keys(fixture.state.badgeUnlocks).sort(),
            SCORECARD_BADGES.map(({ id }) => id).sort(),
        );
        assert.equal(fixture.state.lifetime.avoidedCameraCount, 100);
        assert.equal(fixture.state.lifetime.contributedCameraCount, 10);
        assert.equal(fixture.state.lifetime.privateTripsWithAvoidance, 10);
        assert.equal(fixture.state.trips.length, 10);
        assert.equal(
            getScorecardWindowStats(fixture.state, now).cleanDriveStreak,
            10,
        );
    });

    test('rejects unknown fixture construction', () => {
        assert.throws(
            () => createE2EScorecardFixture('not-a-fixture'),
            /Unknown scorecard E2E fixture/,
        );
    });
});
