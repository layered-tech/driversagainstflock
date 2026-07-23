import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { upsertMarkerPointList } from '../marker-point-merge.js';

function marker(id, label) {
    return {
        geometry: {
            coordinates: [-97.7431, 30.2671],
            type: 'Point',
        },
        properties: { id, label },
        type: 'Feature',
    };
}

describe('upsertMarkerPointList', () => {
    test('replaces existing markers by properties.id and appends new markers', () => {
        const current = [marker(101, 'Existing one'), marker(102, 'Stale')];
        const replacement = marker(102, 'Fresh');
        const added = marker(103, 'New');

        const merged = upsertMarkerPointList(current, [replacement, added]);

        assert.deepEqual(merged, [current[0], replacement, added]);
        assert.deepEqual(current, [
            marker(101, 'Existing one'),
            marker(102, 'Stale'),
        ]);
    });

    test('ignores malformed entries and applies a duplicate incoming id once', () => {
        const current = [marker(101, 'Existing')];
        const firstDuplicate = marker(102, 'First response value');
        const lastDuplicate = marker(102, 'Last response value');
        const malformedEntries = [
            null,
            {},
            { properties: {} },
            { properties: { id: null } },
        ];

        const merged = upsertMarkerPointList(current, [
            ...malformedEntries,
            firstDuplicate,
            lastDuplicate,
        ]);

        assert.deepEqual(merged, [current[0], lastDuplicate]);
    });

    test('treats malformed list inputs as empty lists', () => {
        assert.deepEqual(upsertMarkerPointList(null, undefined), []);
    });
});
