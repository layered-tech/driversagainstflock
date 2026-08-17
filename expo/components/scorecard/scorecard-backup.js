import {
    normalizeScorecardState,
    SCORECARD_STORAGE_VERSION,
    serializeScorecardState,
} from './scorecard-engine.js';

export const SCORECARD_BACKUP_FORMAT = 'driversagainstflock.scorecard-backup';
export const SCORECARD_BACKUP_FORMAT_VERSION = 1;
export const SCORECARD_BACKUP_MAX_CHARACTERS = 5 * 1024 * 1024;

export class ScorecardBackupError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ScorecardBackupError';
    }
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScorecardStateShape(value) {
    return (
        isRecord(value) &&
        isRecord(value.badgeUnlocks) &&
        Array.isArray(value.exposures) &&
        isRecord(value.lifetime) &&
        isRecord(value.settings) &&
        Array.isArray(value.trips)
    );
}

function getExportedAt(now) {
    const exportedAt = new Date(now);

    if (!Number.isFinite(exportedAt.getTime())) {
        throw new ScorecardBackupError(
            'invalid',
            'The scorecard backup date is invalid.',
        );
    }

    return exportedAt.toISOString();
}

function getPortableScorecardState(state) {
    return {
        ...state,
        activeSession: null,
        pendingRecapTripId: null,
    };
}

function assertBackupSize(serializedBackup) {
    if (serializedBackup.length > SCORECARD_BACKUP_MAX_CHARACTERS) {
        throw new ScorecardBackupError(
            'too-large',
            'The scorecard backup is too large to import.',
        );
    }
}

export function getScorecardBackupFilename(now = Date.now()) {
    return `daf-scorecard-backup-${getExportedAt(now).slice(0, 10)}.json`;
}

export function getScorecardBackupSummary(state) {
    return {
        completedDriveCount: state.lifetime.completedDriveCount,
        exposureCount: state.exposures.length,
        xp: state.lifetime.xp,
    };
}

export function createScorecardBackup(state, now = Date.now()) {
    const serializedState = serializeScorecardState(state, now);

    if (!serializedState) {
        throw new ScorecardBackupError(
            'invalid',
            'The scorecard data could not be prepared for export.',
        );
    }

    const serializedBackup = JSON.stringify(
        {
            exportedAt: getExportedAt(now),
            format: SCORECARD_BACKUP_FORMAT,
            formatVersion: SCORECARD_BACKUP_FORMAT_VERSION,
            scorecardState: getPortableScorecardState(
                JSON.parse(serializedState),
            ),
        },
        null,
        2,
    );

    assertBackupSize(serializedBackup);

    return serializedBackup;
}

export function parseScorecardBackup(serializedBackup) {
    if (typeof serializedBackup !== 'string' || !serializedBackup.trim()) {
        throw new ScorecardBackupError(
            'invalid',
            'The selected file is not a scorecard backup.',
        );
    }

    assertBackupSize(serializedBackup);

    let backup;

    try {
        backup = JSON.parse(serializedBackup);
    } catch {
        throw new ScorecardBackupError(
            'invalid',
            'The selected file is not valid JSON.',
        );
    }

    if (!isRecord(backup) || backup.format !== SCORECARD_BACKUP_FORMAT) {
        throw new ScorecardBackupError(
            'invalid',
            'The selected file is not a Drivers Against Flock scorecard backup.',
        );
    }

    if (backup.formatVersion !== SCORECARD_BACKUP_FORMAT_VERSION) {
        throw new ScorecardBackupError(
            'unsupported',
            'This scorecard backup version is not supported.',
        );
    }

    if (!isScorecardStateShape(backup.scorecardState)) {
        throw new ScorecardBackupError(
            'invalid',
            'The scorecard data in this backup is incomplete.',
        );
    }

    if (backup.scorecardState.version !== SCORECARD_STORAGE_VERSION) {
        throw new ScorecardBackupError(
            'unsupported',
            'This scorecard backup version is not supported.',
        );
    }

    if (
        typeof backup.exportedAt !== 'string' ||
        !Number.isFinite(Date.parse(backup.exportedAt))
    ) {
        throw new ScorecardBackupError(
            'invalid',
            'The scorecard backup date is invalid.',
        );
    }

    const state = getPortableScorecardState(
        normalizeScorecardState(backup.scorecardState),
    );

    return {
        exportedAt: backup.exportedAt,
        state,
        summary: getScorecardBackupSummary(state),
    };
}
