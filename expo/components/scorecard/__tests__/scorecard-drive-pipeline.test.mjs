import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const readSource = (relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('scorecard drive pipeline wiring', () => {
    test('initializes the process runtime before router and Auto Play registration', () => {
        const indexSource = readSource('../../../index.js');
        const runtimeInitializationIndex = indexSource.indexOf(
            'initializeScorecardRuntime()',
        );
        const routerRegistrationIndex = indexSource.indexOf(
            "require('expo-router/entry')",
        );
        const autoPlayRegistrationIndex =
            indexSource.indexOf('registerAutoPlay()');

        assert.notEqual(runtimeInitializationIndex, -1);
        assert.ok(runtimeInitializationIndex < routerRegistrationIndex);
        assert.ok(runtimeInitializationIndex < autoPlayRegistrationIndex);
    });

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

    test('owns the accepted-location stream in one process runtime', () => {
        const contextSource = readSource('../scorecard-context.js');
        const instanceSource = readSource('../scorecard-runtime-instance.js');
        const runtimeSource = readSource('../scorecard-runtime.js');

        assert.match(instanceSource, /addAcceptedDeviceLocationListener/);
        assert.match(runtimeSource, /processScorecardRawLocationFix/);
        assert.match(runtimeSource, /updateScorecardRawLocationAnchor/);
        assert.doesNotMatch(contextSource, /addAcceptedDeviceLocationListener/);
        assert.doesNotMatch(runtimeSource, /creditAvoidedRouteCameras/);
        assert.doesNotMatch(runtimeSource, /getScorecardExposureRouteSegment/);
    });

    test('rebuilds the runtime route snapshot after active-session hydration', () => {
        const instanceSource = readSource('../scorecard-runtime-instance.js');
        const runtimeSource = readSource('../scorecard-runtime.js');

        assert.match(runtimeSource, /mergeScorecardSessionRouteCatalog/);
        assert.match(runtimeSource, /getRouteDistanceSnapshot/);
        assert.match(instanceSource, /getDirectionsRouteGeometrySyncKey/);
        assert.doesNotMatch(runtimeSource, /getDirectionsRouteSyncKey/);
    });

    test('settles a user-ended guided route from destination proximity, not reported progress', () => {
        const runtimeSource = readSource('../scorecard-runtime.js');

        assert.doesNotMatch(runtimeSource, /scorecardRouteHasReachedEnd/);
        assert.match(runtimeSource, /scorecardRouteEndedAtDestination/);
        assert.match(
            runtimeSource,
            /manuallyCompleted\s*\?\s*'manual'\s*:\s*'cancelled'/,
        );
        assert.match(runtimeSource, /getScorecardRouteProgressFraction/);
    });

    test('shows completion recaps only for guided drives', () => {
        const runtimeSource = readSource('../scorecard-runtime.js');

        assert.match(
            runtimeSource,
            /completedTrip\?\.completed\s*&&\s*completedTrip\.mode === 'guided'/,
        );
    });

    test('uses one normalized revision for runtime and encrypted persistence', () => {
        const contextSource = readSource('../scorecard-context.js');
        const runtimeSource = readSource('../scorecard-runtime.js');

        assert.match(
            runtimeSource,
            /const committedAt = now\(\);[\s\S]*?const nextState = normalizeScorecardState\(updatedState, committedAt\);[\s\S]*?scorecardState = nextState;[\s\S]*?persistCommittedState\(nextState, committedAt, revision\)/,
        );
        assert.match(
            runtimeSource,
            /function persistCommittedState\(state, committedAt, revision\)[\s\S]*?enqueuePersistence\(async \(\) => \{[\s\S]*?saveState\(state, committedAt\)/,
        );
        assert.doesNotMatch(contextSource, /saveEncryptedScorecardState/);
    });
});
