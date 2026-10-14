import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAreaClient } from '../area-client.js';

function setup(fetchRequest, token = null, timeoutMs) {
    const storage = {
        get: async () => token,
        set: async (value) => {
            token = value;
        },
        clear: async () => {
            token = null;
        },
    };
    return {
        client: createAreaClient({
            buildURL: (path) => path,
            fetchRequest,
            storage,
            timeoutMs,
        }),
        storage,
    };
}
const response = (body, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
});
test('concurrent requests register just one anonymous identity and use the bearer header', async () => {
    const calls = [];
    const { client, storage } = setup(async (url, options) => {
        calls.push({ url, options });
        return response(
            url === 'v1/area-devices' ? { token: 'secret' } : { areas: [] },
        );
    });
    await Promise.all([client(), client('/search?query=Oakland')]);
    assert.equal(
        calls.filter(({ url }) => url === 'v1/area-devices').length,
        1,
    );
    assert.equal(await storage.get(), 'secret');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer secret');
});
test('expired credentials are cleared and only a subsequent user request registers again', async () => {
    const { client, storage } = setup(async () => response({}, 401), 'expired');
    await assert.rejects(client(), /session expired/);
    assert.equal(await storage.get(), null);
});
test('failed saves expose validation messages without leaking server diagnostics', async () => {
    const { client } = setup(
        async () =>
            response({ message: 'SQL database password diagnostics' }, 500),
        'secret',
    );
    await assert.rejects(
        client('', { method: 'POST', body: {} }),
        /unavailable right now/,
    );
    const validation = setup(
        async () =>
            response(
                { errors: { geometry: ['The boundary crosses itself.'] } },
                422,
            ),
        'secret',
    ).client;
    await assert.rejects(
        validation('', { method: 'POST' }),
        /boundary crosses itself/,
    );
});
test('timeouts also cancel requests with an external cancellation signal', async () => {
    const { client } = setup(
        async (url, { signal }) =>
            new Promise((resolve, reject) =>
                signal.addEventListener('abort', () =>
                    reject(new Error('aborted')),
                ),
            ),
        'secret',
        5,
    );
    await assert.rejects(
        client('', { signal: new AbortController().signal }),
        /took too long/,
    );
});
