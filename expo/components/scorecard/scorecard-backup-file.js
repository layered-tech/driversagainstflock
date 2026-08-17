import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const scorecardBackupFileModule = ['android', 'ios'].includes(Platform.OS)
    ? requireOptionalNativeModule('ScorecardBackupFile')
    : null;

export function scorecardBackupFilesAreAvailable() {
    return Boolean(
        scorecardBackupFileModule?.exportBackup &&
        scorecardBackupFileModule?.importBackup,
    );
}

export async function exportScorecardBackupFile(contents, suggestedFilename) {
    if (!scorecardBackupFilesAreAvailable()) {
        throw new Error('Scorecard backup files are unavailable.');
    }

    return scorecardBackupFileModule.exportBackup(contents, suggestedFilename);
}

export async function importScorecardBackupFile() {
    if (!scorecardBackupFilesAreAvailable()) {
        throw new Error('Scorecard backup files are unavailable.');
    }

    return scorecardBackupFileModule.importBackup();
}
