import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getE2EDrivingAlertsFixture,
    normalizeE2EDrivingAlertsFixture,
} from '../e2e-driving-alert-fixture.js';

describe('E2E driving-alert fixtures', () => {
    test('accepts only the supported fixture names', () => {
        assert.equal(normalizeE2EDrivingAlertsFixture('POLICE'), 'police');
        assert.equal(normalizeE2EDrivingAlertsFixture('alpr'), 'alpr');
        assert.equal(normalizeE2EDrivingAlertsFixture('combined'), 'combined');
        assert.equal(normalizeE2EDrivingAlertsFixture('other'), null);
        assert.equal(normalizeE2EDrivingAlertsFixture(null), null);
    });

    test('returns deterministic single and combined alert data', () => {
        const now = Date.parse('2026-07-30T12:00:00.000Z');

        assert.deepEqual(getE2EDrivingAlertsFixture('police', now), [
            {
                distanceMeters: 244,
                id: 'e2e-police-alert',
                source: { publishedAt: '2026-07-30T11:56:00.000Z' },
                type: 'police',
            },
        ]);
        assert.deepEqual(getE2EDrivingAlertsFixture('alpr', now), [
            {
                distanceMeters: 483,
                id: 'e2e-alpr-alert',
                source: { tags: { manufacturer: 'Flock Safety' } },
                type: 'alpr',
            },
        ]);
        assert.deepEqual(
            getE2EDrivingAlertsFixture('combined', now).map(
                ({ distanceMeters, id, type }) => ({
                    distanceMeters,
                    id,
                    type,
                }),
            ),
            [
                {
                    distanceMeters: 244,
                    id: 'e2e-police-alert',
                    type: 'police',
                },
                {
                    distanceMeters: 483,
                    id: 'e2e-alpr-alert',
                    type: 'alpr',
                },
            ],
        );
        assert.equal(getE2EDrivingAlertsFixture('unknown', now), null);
    });
});
