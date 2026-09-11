import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

import {
    createEmptyScorecardState,
    parseScorecardState,
    SCORECARD_STATS_WINDOW_MS,
    serializeScorecardState,
} from '../scorecard-engine.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const scorecardStorageSource = readFileSync(
    new URL('../scorecard-storage.js', import.meta.url),
    'utf8',
);

function createScorecardStorageHarness(initialSerializedState) {
    const writes = [];
    let serializedState = initialSerializedState;
    const module = { exports: {} };
    const transformedSource = transformSync(scorecardStorageSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        '../../lib/private-cache-storage': {
            async getPrivateCacheItem() {
                return serializedState;
            },
            privateCacheStorageIsEncrypted: () => true,
            async removePrivateCacheItem() {
                serializedState = null;
            },
            async setPrivateCacheItem(storageKey, value) {
                writes.push({ storageKey, value });
                serializedState = value;
            },
        },
        './scorecard-engine': {
            createEmptyScorecardState,
            parseScorecardState,
            serializeScorecardState,
        },
        'react-native': {
            Platform: { OS: 'ios' },
        },
    };

    new Function('require', 'module', 'exports', transformedSource)(
        (specifier) => mockedModules[specifier],
        module,
        module.exports,
    );

    return {
        getSerializedState: () => serializedState,
        scorecardStorage: module.exports,
        writes,
    };
}

describe('scorecard encrypted storage', () => {
    test('rewrites retained state after geographic records expire', async () => {
        const expiredAt = Date.parse('2026-06-01T12:00:00Z');
        const state = {
            ...createEmptyScorecardState(),
            exposures: [
                {
                    cameraCoordinate: [-97.74, 30.26],
                    certainty: 'confirmed',
                    id: 'read-expired',
                    occurredAt: expiredAt,
                    osmId: 'expired-camera',
                    sessionId: 'drive-expired',
                },
            ],
        };
        const serializedState = serializeScorecardState(state, expiredAt);
        const now = expiredAt + SCORECARD_STATS_WINDOW_MS + 1;
        const harness = createScorecardStorageHarness(serializedState);

        const loadedState =
            await harness.scorecardStorage.loadEncryptedScorecardState(now);

        assert.equal(loadedState.exposures.length, 0);
        assert.equal(harness.writes.length, 1);
        assert.equal(
            parseScorecardState(harness.getSerializedState(), now).exposures
                .length,
            0,
        );
        assert.doesNotMatch(
            harness.getSerializedState(),
            /cameraCoordinate|expired-camera/,
        );
    });

    test('does not rewrite an already-normalized encrypted payload', async () => {
        const now = Date.parse('2026-08-30T12:00:00Z');
        const serializedState = serializeScorecardState(
            createEmptyScorecardState(),
            now,
        );
        const harness = createScorecardStorageHarness(serializedState);

        await harness.scorecardStorage.loadEncryptedScorecardState(now);

        assert.equal(harness.writes.length, 0);
        assert.equal(harness.getSerializedState(), serializedState);
    });
});
