import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(
    readFileSync(
        new URL('../../../lib/network-debug.js', import.meta.url),
        'utf8',
    ),
    {
        babelrc: false,
        configFile: false,
        plugins: [require('@babel/plugin-transform-modules-commonjs')],
    },
).code;
function harness({
    environment = 'staging',
    dev = true,
    fetch = async () => ({ ok: true, status: 200 }),
    log,
} = {}) {
    const logs = [],
        snapshots = [];
    let now = 0;
    const globals = { fetch, performance: { now: () => (now += 25) } };
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        'globalThis',
        'console',
        '__DEV__',
        code,
    )(
        (name) =>
            name === 'expo-constants'
                ? { expoConfig: { extra: { environment } } }
                : {},
        module,
        module.exports,
        globals,
        { log: log ?? ((line) => logs.push(line)) },
        dev,
    );
    module.exports.subscribeToNetworkDebugRequests((requests) =>
        snapshots.push(requests),
    );
    module.exports.installNetworkDebugFetchMonitor();
    return {
        logs,
        snapshots,
        globals,
        install: module.exports.installNetworkDebugFetchMonitor,
    };
}

test('Metro messages and overlay updates share IDs, method, outcome and duration', async () => {
    const response = { ok: true, status: 201 };
    const h = harness({ fetch: async () => response });
    const returned = await h.globals.fetch(
        'https://host.test/roads?token=secret#secret',
        { method: 'post' },
    );
    assert.equal(returned, response);
    assert.deepEqual(h.logs, [
        '[network #1] POST https://host.test/roads START',
        '[network #1] POST https://host.test/roads OK 201 (25ms)',
    ]);
    assert.equal(h.snapshots[0][0].state, 'pending');
    assert.equal(h.snapshots[1][0].status, 201);
    assert.equal(
        h.snapshots[1][0].url,
        'https://host.test/roads?token=secret#secret',
    );
});
test('HTTP failures remain responses and thrown failures retain their original error', async () => {
    const http = harness({ fetch: async () => ({ ok: false, status: 403 }) });
    assert.equal(
        (
            await http.globals.fetch({
                url: 'https://host.test/tile',
                method: 'head',
            })
        ).status,
        403,
    );
    assert.match(http.logs[1], /HEAD .* BAD 403/);
    const error = Object.assign(new Error('secret response'), {
        name: 'AbortError',
    });
    const failed = harness({
        fetch: async () => {
            throw error;
        },
    });
    await assert.rejects(
        failed.globals.fetch('https://host.test/tile'),
        (value) => value === error,
    );
    assert.match(failed.logs[1], /AbortError \(25ms\)/);
    assert.ok(!failed.logs.join('').includes('secret response'));
});
test('production, release bundles and non-network requests do not emit Metro logs', async () => {
    for (const options of [{ environment: 'production' }, { dev: false }]) {
        const h = harness(options);
        await h.globals.fetch('https://host.test/');
        assert.deepEqual(h.logs, []);
    }
    const h = harness();
    await h.globals.fetch('file:///tile');
    assert.deepEqual(h.logs, []);
    assert.deepEqual(h.snapshots, []);
});
test('install is idempotent and credentials never appear in console output', async () => {
    const h = harness();
    h.install();
    await h.globals.fetch(
        'https://user:password@host.test/tile?X-Amz-Signature=secret',
    );
    assert.equal(h.logs.length, 2);
    assert.ok(
        h.logs.every(
            (line) => !line.includes('secret') && !line.includes('password'),
        ),
    );
});
test('console failures cannot change fetch behavior', async () => {
    const h = harness({
        log: () => {
            throw new Error('console failure');
        },
    });
    assert.equal((await h.globals.fetch('https://host.test/')).status, 200);
    assert.equal(h.snapshots.length, 2);
});

test('native generic fetch errors are identified as timeout or cancellation from the signal', async () => {
    for (const [name, label] of [
        ['TimeoutError', 'TIMEOUT'],
        ['AbortError', 'CANCELLED'],
    ]) {
        const controller = new AbortController();
        const h = harness({
            fetch: async () => {
                controller.abort(
                    Object.assign(new Error('private reason'), { name }),
                );
                throw new Error('Fetch failed');
            },
        });
        await assert.rejects(
            h.globals.fetch('https://host.test/', {
                signal: controller.signal,
            }),
        );
        assert.match(h.logs[1], new RegExp(label));
        assert.equal(h.snapshots[1][0].errorName, label);
        assert.ok(!h.logs[1].includes('private reason'));
    }
});
