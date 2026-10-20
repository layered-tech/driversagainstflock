import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    loadPilotCorridor,
    selectCorridorTiles,
} from '../road-corridor-pilot-core.js';
import {
    corridorSourceLabel,
    getCorridorSource,
    publishCorridorSource,
} from '../road-corridor-source.js';

const tile = { id: '-895_430', record_count: 1 };
const catalog = {
    coverage: [
        [
            [
                [-91, 42],
                [-88, 42],
                [-88, 45],
                [-91, 45],
                [-91, 42],
            ],
        ],
    ],
    tiles: [tile],
};
const location = { longitude: -89.45, latitude: 43.05 };

test('requires whole requested tile coverage and keeps away from polygon boundaries', () => {
    assert.deepEqual(selectCorridorTiles(catalog, location, 100), [tile]);
    assert.throws(
        () =>
            selectCorridorTiles(catalog, { longitude: -91, latitude: 43 }, 100),
        /boundary|Outside/,
    );
    assert.throws(
        () =>
            selectCorridorTiles(
                catalog,
                { longitude: -89.41, latitude: 43.09 },
                3200,
            ),
        /missing/,
    );
});
test('downloaded roads bypass service and preserve provenance without claiming active source', async () => {
    const before = getCorridorSource();
    const result = await loadPilotCorridor({
        catalog,
        location,
        radiusMeters: 100,
        loadTile: async () => [
            {
                id: 'way',
                coordinates: [
                    [-89.45, 43.05],
                    [-89.449, 43.05],
                ],
            },
        ],
        normalize: (x) => x,
        service: () => assert.fail('service called'),
    });
    assert.equal(result.corridorSource.source, 'download');
    assert.equal(getCorridorSource(), before);
});
test('corrupt or missing downloads fall back with a visible reason', async () => {
    let calls = 0;
    const result = await loadPilotCorridor({
        catalog,
        location,
        radiusMeters: 100,
        loadTile: async () => {
            throw new Error('Tile checksum failed');
        },
        normalize: (x) => x,
        service: async () => {
            calls++;
            return [{ id: 'service' }];
        },
    });
    assert.equal(calls, 1);
    assert.match(
        corridorSourceLabel(result.corridorSource),
        /Existing service — fallback\nTile checksum failed/,
    );
});
test('cancellation never starts service fallback', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        loadPilotCorridor({
            catalog,
            location,
            radiusMeters: 100,
            signal: controller.signal,
            loadTile: async () => {
                throw new Error('cancelled');
            },
            service: () => assert.fail('service called'),
        }),
    );
});
test('failed service does not report fallback as active', async () => {
    publishCorridorSource({
        source: 'unavailable',
        reason: 'No usable road corridor',
    });
    await assert.rejects(
        loadPilotCorridor({
            catalog,
            location: { longitude: 0, latitude: 0 },
            service: async () => {
                throw new Error('offline');
            },
        }),
    );
    assert.equal(getCorridorSource().source, 'unavailable');
});
