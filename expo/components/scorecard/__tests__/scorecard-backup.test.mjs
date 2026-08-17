import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createScorecardBackup,
    getScorecardBackupFilename,
    parseScorecardBackup,
    SCORECARD_BACKUP_FORMAT,
    SCORECARD_BACKUP_MAX_CHARACTERS,
    ScorecardBackupError,
} from '../scorecard-backup.js';
import { createEmptyScorecardState } from '../scorecard-engine.js';

const EXPORTED_AT = Date.parse('2026-08-17T14:30:00.000Z');

function makeScorecardState() {
    return {
        ...createEmptyScorecardState(),
        activeSession: {
            id: 'drive-active',
            mode: 'free',
            startedAt: EXPORTED_AT - 1_000,
        },
        badgeUnlocks: { ghost: EXPORTED_AT - 2_000 },
        exposures: [
            {
                cameraCoordinate: [-87.6298, 41.8781],
                certainty: 'confirmed',
                id: 'read-1',
                occurredAt: EXPORTED_AT - 3_000,
                osmId: '123',
                sessionId: 'drive-1',
            },
        ],
        lifetime: {
            ...createEmptyScorecardState().lifetime,
            completedDriveCount: 12,
            xp: 2_400,
        },
        pendingRecapTripId: 'drive-1',
        trips: [
            {
                endedAt: EXPORTED_AT - 2_000,
                id: 'drive-1',
                startedAt: EXPORTED_AT - 4_000,
            },
        ],
    };
}

describe('scorecard backups', () => {
    test('round trips the persisted scorecard whitelist in a versioned envelope', () => {
        const serializedBackup = createScorecardBackup(
            makeScorecardState(),
            EXPORTED_AT,
        );
        const envelope = JSON.parse(serializedBackup);
        const restored = parseScorecardBackup(serializedBackup);

        assert.equal(envelope.format, SCORECARD_BACKUP_FORMAT);
        assert.equal(envelope.formatVersion, 1);
        assert.equal(envelope.exportedAt, '2026-08-17T14:30:00.000Z');
        assert.equal(restored.state.lifetime.xp, 2_400);
        assert.equal(restored.state.trips.length, 1);
        assert.equal(restored.state.exposures.length, 1);
        assert.deepEqual(restored.state.badgeUnlocks, {
            ghost: EXPORTED_AT - 2_000,
        });
        assert.deepEqual(restored.summary, {
            completedDriveCount: 12,
            exposureCount: 1,
            xp: 2_400,
        });
    });

    test('never transfers an in-progress drive or pending recap', () => {
        const serializedBackup = createScorecardBackup(
            makeScorecardState(),
            EXPORTED_AT,
        );
        const restored = parseScorecardBackup(serializedBackup);

        assert.equal(restored.state.activeSession, null);
        assert.equal(restored.state.pendingRecapTripId, null);
    });

    test('uses a stable, date-stamped filename', () => {
        assert.equal(
            getScorecardBackupFilename(EXPORTED_AT),
            'daf-scorecard-backup-2026-08-17.json',
        );
    });

    test('rejects unrelated, malformed, oversized, and unsupported files', () => {
        const validEnvelope = JSON.parse(
            createScorecardBackup(makeScorecardState(), EXPORTED_AT),
        );
        const cases = [
            ['not-json', 'invalid'],
            [JSON.stringify({ format: 'another-app' }), 'invalid'],
            [
                JSON.stringify({ ...validEnvelope, formatVersion: 99 }),
                'unsupported',
            ],
            [
                JSON.stringify({
                    ...validEnvelope,
                    scorecardState: { version: 1 },
                }),
                'invalid',
            ],
            ['x'.repeat(SCORECARD_BACKUP_MAX_CHARACTERS + 1), 'too-large'],
        ];

        for (const [serializedBackup, expectedCode] of cases) {
            assert.throws(
                () => parseScorecardBackup(serializedBackup),
                (error) =>
                    error instanceof ScorecardBackupError &&
                    error.code === expectedCode,
            );
        }
    });

    test('normalizes imported scorecard values before returning them', () => {
        const envelope = JSON.parse(
            createScorecardBackup(makeScorecardState(), EXPORTED_AT),
        );
        envelope.scorecardState.lifetime.xp = -100;
        envelope.scorecardState.badgeUnlocks.unknown = EXPORTED_AT;
        envelope.scorecardState.settings.fuelEconomyMpg = 999;

        const restored = parseScorecardBackup(JSON.stringify(envelope));

        assert.equal(restored.state.lifetime.xp, 0);
        assert.equal(restored.state.badgeUnlocks.unknown, undefined);
        assert.equal(restored.state.settings.fuelEconomyMpg, null);
    });
});
