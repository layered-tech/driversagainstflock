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
            '/scorecard/private',
        );
        assert.equal(
            redactPrivateScorecardPath(
                'Navigation to /scorecard/event/read-local-secret',
            ),
            'Navigation to /scorecard/private',
        );
    });

    test('skips scorecard screen analytics before opening Firebase', () => {
        const analyticsSource = readSource('../../../lib/analytics.js');

        assert.match(
            analyticsSource,
            /logAnalyticsScreenView\(pathname\)[\s\S]*?isPrivateScorecardPath\(pathname\)[\s\S]*?return;[\s\S]*?getAnalyticsScreenName/,
        );
    });

    test('drops scorecard navigation and events before Sentry sends them', () => {
        const sentrySource = readSource('../../../lib/sentry.js');

        assert.match(
            sentrySource,
            /beforeSend\(event\)[\s\S]*?sentryEventIsPrivateScorecard\(event\)[\s\S]*?return null;/,
        );
        assert.match(
            sentrySource,
            /beforeSendTransaction\(event\)[\s\S]*?sentryEventIsPrivateScorecard\(event\) \? null : event/,
        );
        assert.match(
            sentrySource,
            /serializedBreadcrumb\.toLowerCase\(\)\.includes\('scorecard'\)[\s\S]*?return null;/,
        );
        assert.match(
            sentrySource,
            /isPrivateScorecardPath\(pathname\)[\s\S]*?previousPathnameRef\.current = null;[\s\S]*?return;/,
        );
        assert.match(
            sentrySource,
            /privateScorecardRouteIsActive = isPrivateScorecardPath\(pathname\)/,
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
            /createE2EScorecardFixture\(requestedFixture\)[\s\S]*?commitState\(\{[\s\S]*?\.\.\.fixture\.state,[\s\S]*?pendingRecapTripId:/,
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

        assert.match(backupSource, /serializeScorecardState/);
        assert.match(backupSource, /activeSession: null/);
        assert.match(backupSource, /pendingRecapTripId: null/);
        assert.doesNotMatch(
            backupSource,
            /fetch\(|analytics|sentry|latitude|longitude/,
        );
        assert.match(
            contextSource,
            /saveEncryptedScorecardState\(backup\.state\)[\s\S]*?setScorecardState\(backup\.state\)/,
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
