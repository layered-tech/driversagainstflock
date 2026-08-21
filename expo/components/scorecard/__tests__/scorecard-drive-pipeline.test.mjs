import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const readSource = (relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('scorecard drive pipeline wiring', () => {
    test('publishes raw fixes before road matching and fallback rendering', () => {
        const roadMatchingSource = readSource(
            '../../map/road-matching-session.js',
        );
        const fallbackSource = readSource('../../map/use-device-location.js');

        assert.match(
            roadMatchingSource,
            /publishAcceptedDeviceLocation\(location\);\s*applyRawLocation\(location\)/,
        );
        assert.match(
            fallbackSource,
            /publishAcceptedDeviceLocation\(location\);\s*handleUserLocationUpdate\(location\)/,
        );
    });

    test('uses the raw stream and removes progressive route credit', () => {
        const contextSource = readSource('../scorecard-context.js');

        assert.match(contextSource, /addAcceptedDeviceLocationListener/);
        assert.match(contextSource, /processScorecardRawLocationFix/);
        assert.match(contextSource, /updateScorecardRawLocationAnchor/);
        assert.match(contextSource, /seedRawLocationAnchor/);
        assert.doesNotMatch(contextSource, /creditAvoidedRouteCameras/);
        assert.doesNotMatch(contextSource, /getScorecardExposureRouteSegment/);
    });

    test('rebuilds the runtime route snapshot after active-session hydration', () => {
        const contextSource = readSource('../scorecard-context.js');

        assert.match(
            contextSource,
            /mergeScorecardSessionRouteCatalog[\s\S]*?scorecardState\.activeSession\?\.id/,
        );
        assert.match(contextSource, /getDirectionsRouteGeometrySyncKey/);
        assert.doesNotMatch(contextSource, /getDirectionsRouteSyncKey/);
    });

    test('settles a user-ended guided route from destination proximity, not reported progress', () => {
        const contextSource = readSource('../scorecard-context.js');

        assert.doesNotMatch(contextSource, /scorecardRouteHasReachedEnd/);
        assert.match(contextSource, /scorecardRouteEndedAtDestination/);
        assert.match(
            contextSource,
            /manuallyCompletedGuidedRoute\s*\?\s*'manual'\s*:\s*'cancelled'/,
        );
        assert.match(contextSource, /getScorecardRouteProgressFraction/);
    });

    test('shows completion recaps only for guided drives', () => {
        const contextSource = readSource('../scorecard-context.js');

        assert.match(
            contextSource,
            /completedTrip\?\.completed\s*&&\s*completedTrip\.mode === 'guided'/,
        );
    });

    test('uses one normalized revision for runtime and encrypted persistence', () => {
        const contextSource = readSource('../scorecard-context.js');

        assert.match(
            contextSource,
            /const committedAt = Date\.now\(\);\s+const nextState = normalizeScorecardState\(updatedState, committedAt\);[\s\S]*?stateRef\.current = nextState;[\s\S]*?saveEncryptedScorecardState\(nextState, committedAt\)/,
        );
    });
});
