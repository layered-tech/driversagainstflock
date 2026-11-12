import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTvClient } from '../tv-client.js';
import { tvActionPlace } from '../tv-actions.js';

test('phone rejects route proposals even when their coordinates are valid', () => {
    for (const type of ['route-proposal', 'route-preview']) {
        assert.equal(
            tvActionPlace({
                type,
                payload: {
                    latitude: 37.8,
                    longitude: -122.2,
                    destination: { latitude: 37.8, longitude: -122.2 },
                },
            }),
            null,
        );
    }
});
test('polling keeps camera actions and discards obsolete route actions', async () => {
    const actions = [
        'route-preview',
        'camera',
        'route-proposal',
        'watch-camera',
    ].map((type) => ({ type }));
    const client = createTvClient({
        credentials: { get: async () => ({ token: 'test' }) },
        transport: {
            request: async () =>
                JSON.stringify({ ok: true, protocolVersion: 1, actions }),
        },
    });
    assert.deepEqual(
        (await client.poll()).map((action) => action.type),
        ['camera', 'watch-camera'],
    );
    assert.equal(client.replyPreview, undefined);
});
