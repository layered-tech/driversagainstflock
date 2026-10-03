import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    getPrivacySafeMonitoringPathname,
    isPrivateScorecardPath,
    redactPrivateScorecardPath,
} from '../../../lib/privacy-routes.js';

function readSource(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('scorecard telemetry and storage boundary', () => {
    test('recognizes every scorecard subroute as private', () => {
        assert.equal(isPrivateScorecardPath('/scorecard'), true);
        assert.equal(
            isPrivateScorecardPath('/scorecard/event/read-local-secret'),
            true,
        );
        assert.equal(isPrivateScorecardPath('/hotlist'), false);
        assert.equal(
            getPrivacySafeMonitoringPathname(
                '/scorecard/event/read-local-secret',
            ),
            '/scorecard/event/[id]',
        );
        assert.equal(
            redactPrivateScorecardPath(
                'Navigation to /scorecard/event/read-local-secret',
            ),
            'Navigation to /scorecard/event/[id]',
        );
    });

    test('sanitizes screen analytics instead of excluding Scorecard', () => {
        const source = readSource('../../../lib/analytics.js');
        assert.match(source, /getPrivacySafeMonitoringPathname\(pathname\)/);
        assert.doesNotMatch(source, /isPrivateScorecardPath/);
        assert.match(
            source,
            /getCleanAnalyticsParams\(sanitizeDiagnosticValue\(params\)\)/,
        );
    });

    test('stores scorecard state through the encrypted private cache only', () => {
        const storageSource = readSource('../scorecard-storage.js');

        assert.match(storageSource, /getPrivateCacheItem/);
        assert.match(storageSource, /setPrivateCacheItem/);
        assert.match(storageSource, /removePrivateCacheItem/);
        assert.match(storageSource, /privateCacheStorageIsEncrypted/);
        assert.doesNotMatch(storageSource, /AsyncStorage/);
        assert.match(
            storageSource,
            /Platform\.OS === 'ios' \|\| Platform\.OS === 'android'/,
        );
    });

    test('keeps the Maestro fixture E2E-only and uses encrypted persistence', () => {
        const contextSource = readSource('../scorecard-context.js');
        const fixtureSource = readSource('../scorecard-e2e-fixture.js');

        assert.match(contextSource, /APP_ENVIRONMENT !== 'e2e'[\s\S]*?return;/);
        assert.match(
            contextSource,
            /createE2EScorecardFixture\(requestedFixture\)[\s\S]*?updateScorecardRuntimeState\(\s*\{[\s\S]*?\.\.\.fixture\.state,[\s\S]*?pendingRecapTripId:/,
        );
        assert.match(
            contextSource,
            /if \(isHydrated\)[\s\S]*?applyE2EScorecardFixture\(url\)[\s\S]*?pendingE2EFixtureURLRef\.current = url/,
        );
        assert.match(
            contextSource,
            /pendingE2EFixtureURLRef\.current = null;[\s\S]*?applyE2EScorecardFixture\(pendingFixtureURL\)/,
        );
        assert.doesNotMatch(fixtureSource, /fetch\(|AsyncStorage|SecureStore/);
    });

    test('keeps backup transfer user-directed and restores through encrypted persistence', () => {
        const backupSource = readSource('../scorecard-backup.js');
        const contextSource = readSource('../scorecard-context.js');

        const runtimeSource = readSource('../scorecard-runtime.js');
        assert.match(backupSource, /serializeScorecardState/);
        assert.match(backupSource, /activeSession: null/);
        assert.match(backupSource, /pendingRecapTripId: null/);
        assert.doesNotMatch(
            backupSource,
            /fetch\(|analytics|crashlytics|latitude|longitude/,
        );
        assert.match(
            contextSource,
            /replaceScorecardRuntimeState\(backup\.state\)/,
        );
        assert.match(
            runtimeSource,
            /async function performStateReplacement\(nextState\)[\s\S]*?normalizeScorecardState\([\s\S]*?nextState,[\s\S]*?replacedAt[\s\S]*?await enqueuePersistence\([\s\S]*?saveState\(normalizedState, replacedAt\)[\s\S]*?if \(!wasSaved\)[\s\S]*?return false;[\s\S]*?scorecardState = normalizedState/,
        );
        assert.match(
            runtimeSource,
            /function queueStateReplacement\(operation\)[\s\S]*?stateReplacementQueue[\s\S]*?function replaceState\(nextState\)[\s\S]*?queueStateReplacement/,
        );
        assert.doesNotMatch(
            contextSource,
            /saveEncryptedScorecardState|setScorecardState/,
        );
    });

    test('requests a generic price table without sending a state or location', () => {
        const gasPriceSource = readSource('../state-gas-prices.js');

        assert.match(
            gasPriceSource,
            /buildApiURL\('v1\/fuel-prices\/state-averages'\)/,
        );
        assert.doesNotMatch(
            gasPriceSource,
            /latitude|longitude|stateCode.*fetch/,
        );
    });
});
