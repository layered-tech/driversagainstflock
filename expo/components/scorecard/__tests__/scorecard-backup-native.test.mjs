import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('scorecard backup native file bridge', () => {
    test('registers the local module on Android and Apple', () => {
        const moduleConfig = JSON.parse(
            readSource(
                '../../../modules/scorecard-backup-file/expo-module.config.json',
            ),
        );

        assert.deepEqual(moduleConfig.platforms, ['android', 'apple']);
        assert.deepEqual(moduleConfig.android.modules, [
            'expo.modules.scorecardbackupfile.ScorecardBackupFileModule',
        ]);
        assert.deepEqual(moduleConfig.apple.modules, [
            'ScorecardBackupFileModule',
        ]);
    });

    test('uses Android system create/open document flows with bounded local I/O', () => {
        const contractSource = readSource(
            '../../../modules/scorecard-backup-file/android/src/main/java/expo/modules/scorecardbackupfile/BackupDocumentContract.kt',
        );
        const moduleSource = readSource(
            '../../../modules/scorecard-backup-file/android/src/main/java/expo/modules/scorecardbackupfile/ScorecardBackupFileModule.kt',
        );

        assert.match(contractSource, /Intent\.ACTION_CREATE_DOCUMENT/);
        assert.match(contractSource, /Intent\.ACTION_OPEN_DOCUMENT/);
        assert.match(contractSource, /application\/json/);
        assert.match(moduleSource, /MAX_BACKUP_BYTES/);
        assert.match(moduleSource, /openOutputStream/);
        assert.match(moduleSource, /openInputStream/);
        assert.doesNotMatch(moduleSource, /http|fetch|upload/);
    });

    test('uses iOS system export/open document pickers and removes its temporary file', () => {
        const moduleSource = readSource(
            '../../../modules/scorecard-backup-file/ios/ScorecardBackupFileModule.swift',
        );

        assert.match(
            moduleSource,
            /UIDocumentPickerViewController\(forExporting:/,
        );
        assert.match(moduleSource, /forOpeningContentTypes:/);
        assert.match(moduleSource, /maximumBackupBytes/);
        assert.match(moduleSource, /removeTemporaryDirectory/);
        assert.doesNotMatch(moduleSource, /URLSession|uploadTask|dataTask/);
    });
});
