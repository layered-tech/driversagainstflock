import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createTvClient,
    parseTvPairingUri,
    tvPairingUriFromLinkParams,
} from '../tv-client.js';

const uri = `daf-tv://pair?host=192.168.1.20&port=42123&fingerprint=${'a'.repeat(64)}&code=ABC234`;
test('pairing accepts only a local numeric endpoint with a pinned certificate', () => {
    assert.equal(parseTvPairingUri(uri).host, '192.168.1.20');
    for (const bad of [
        uri.replace('192.168.1.20', '8.8.8.8'),
        uri.replace('192.168.1.20', 'example.com'),
        uri.replace('42123', '0'),
        uri.replace('ABC234', '123'),
        uri.replace('daf-tv:', 'https:'),
    ]) {
        assert.equal(parseTvPairingUri(bad), null);
    }
});
test('pairing URI parses with React Native custom-scheme URL behavior', () => {
    const originalURL = globalThis.URL;
    globalThis.URL = class extends originalURL {
        get hostname() {
            return this.protocol === 'daf-tv:' ? '' : super.hostname;
        }
    };
    try {
        assert.equal(parseTvPairingUri(uri)?.host, '192.168.1.20');
    } finally {
        globalThis.URL = originalURL;
    }
});
test('deep link fields preserve the complete pairing endpoint', () => {
    const input = parseTvPairingUri(uri);
    const reconstructed = tvPairingUriFromLinkParams({
        tvHost: input.host,
        tvPort: String(input.port),
        tvFingerprint: input.fingerprint,
        tvCode: input.code,
    });
    assert.deepEqual(parseTvPairingUri(reconstructed), input);
    assert.equal(tvPairingUriFromLinkParams({ tvHost: '8.8.8.8' }), null);
});
test('client stores credential without pairing code and sends monotonic revisions', async () => {
    let saved = null;
    const messages = [];
    const client = createTvClient({
        transport: {
            async request(host, port, fingerprint, json) {
                const message = JSON.parse(json);
                messages.push(message);
                return JSON.stringify({
                    ok: true,
                    protocolVersion: 1,
                    ...(message.operation === 'pair'
                        ? { token: 'a'.repeat(43) }
                        : {}),
                });
            },
        },
        credentials: {
            async get() {
                return saved;
            },
            async set(value) {
                saved = value;
            },
            async clear() {
                saved = null;
            },
        },
        clock: () => 100,
    });
    await client.pair(uri);
    assert.equal(saved.code, undefined);
    await client.sync({ protocolVersion: 1, areas: [] });
    await client.sync({ protocolVersion: 1, areas: [] });
    assert.deepEqual(
        messages
            .filter((m) => m.operation === 'snapshot')
            .map((m) => m.revision),
        [100, 101],
    );
    await client.unpair();
    assert.equal(saved, null);
});
test('failed secure storage revokes newly issued credential', async () => {
    const operations = [];
    const client = createTvClient({
        transport: {
            async request(h, p, f, raw) {
                operations.push(JSON.parse(raw).operation);
                return JSON.stringify({
                    ok: true,
                    protocolVersion: 1,
                    token: 'a'.repeat(43),
                });
            },
        },
        credentials: {
            async set() {
                throw new Error('Storage unavailable');
            },
        },
    });
    await assert.rejects(client.pair(uri), /Storage unavailable/);
    assert.deepEqual(operations, ['pair', 'unpair']);
});

test('phone can clear its credential after unpairing from the TV', async () => {
    let cleared = false;
    const client = createTvClient({
        transport: {
            async request() {
                return JSON.stringify({
                    ok: false,
                    protocolVersion: 1,
                    error: 'not-paired',
                });
            },
        },
        credentials: {
            async get() {
                return {
                    host: '192.168.1.2',
                    port: 1234,
                    fingerprint: 'a'.repeat(64),
                    token: 'old',
                };
            },
            async clear() {
                cleared = true;
            },
        },
    });
    await client.unpair();
    assert.equal(cleared, true);
});

for (const failure of [
    'TV identity changed. Scan its QR code again.',
    'Connection refused',
    'Request timed out',
]) {
    test(`phone unpairs when the TV request fails: ${failure}`, async () => {
        let saved = { ...parseTvPairingUri(uri), token: 'old' };
        let notified = false;
        const client = createTvClient({
            transport: {
                async request() {
                    assert.equal(saved, null);
                    notified = true;
                    throw new Error(failure);
                },
            },
            credentials: {
                async get() {
                    return saved;
                },
                async clear() {
                    saved = null;
                },
            },
        });
        await client.unpair();
        assert.equal(saved, null);
        assert.equal(notified, true);
        assert.equal(await client.sync({}), false);
        assert.deepEqual(await client.poll(), []);
    });
}

test('phone unpairs without waiting for a TV response', async () => {
    let cleared = false;
    let complete;
    const response = new Promise((resolve) => {
        complete = resolve;
    });
    const client = createTvClient({
        transport: { request: () => response },
        credentials: {
            async get() {
                return { ...parseTvPairingUri(uri), token: 'old' };
            },
            async clear() {
                cleared = true;
            },
        },
    });
    try {
        const result = await Promise.race([
            client.unpair().then(() => 'unpaired'),
            new Promise((resolve) => setTimeout(() => resolve('blocked'), 100)),
        ]);
        assert.equal(result, 'unpaired');
        assert.equal(cleared, true);
    } finally {
        complete(JSON.stringify({ ok: true, protocolVersion: 1 }));
    }
});

test('phone reports storage failures instead of claiming to unpair', async () => {
    const client = createTvClient({
        transport: {
            request: () => assert.fail('TV notified before local clear'),
        },
        credentials: {
            async get() {
                return { ...parseTvPairingUri(uri), token: 'old' };
            },
            async clear() {
                throw new Error('Storage unavailable');
            },
        },
    });
    await assert.rejects(client.unpair(), /Storage unavailable/);
});
