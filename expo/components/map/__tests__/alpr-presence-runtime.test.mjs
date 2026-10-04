import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const payload = {
    osm_node_id: 12634608635,
    response: 'not_there',
    platform: 'android_auto',
};

function runtime(
    environment,
    mocks = false,
    { save = async () => {}, encrypted = true } = {},
) {
    let options;
    const requests = [],
        logs = [];
    const module = { exports: {} };
    const { code } = require('@babel/core').transformSync(
        readFileSync(
            new URL('../alpr-presence-runtime.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    );
    const modules = {
        '../../lib/place-search-session': {},
        '../../lib/private-cache-storage': {
            privateCacheStorageIsEncrypted: () => encrypted,
            setPrivateCacheItem: save,
        },
        '../auto-play-session-state': {},
        './alpr-presence-coordinator': {
            createPresenceCoordinator: (value) => {
                options = value;
                return { state: { outbox: [{ payload }] } };
            },
        },
        './alpr-presence-debug': { presenceDebugStore: { event() {} } },
        './api-mocks': { mapApiMocksAreEnabled: () => mocks },
        './config': {
            APP_ENVIRONMENT: environment,
            buildApiURL: (path) => `http://local.test/api${path}`,
        },
        './debug-overlays': {},
        './shared-map-preferences-sync': {},
    };
    new Function(
        'require',
        'module',
        'exports',
        'fetch',
        'console',
        'AbortController',
        'setTimeout',
        'clearTimeout',
        code,
    )(
        (name) => {
            assert.ok(name in modules, name);
            return modules[name];
        },
        module,
        module.exports,
        async (...args) => {
            requests.push(args);
            return {
                ok: true,
                json: async () => ({ status: 'received', id: 1 }),
            };
        },
        { info: (value) => logs.push(value) },
        AbortController,
        setTimeout,
        clearTimeout,
    );
    return { options, requests, logs };
}

test('live-inventory E2E confirmation keeps negative reports local even when map mocks are off', async () => {
    const h = runtime('e2e');
    await assert.rejects(h.options.send(payload), /E2E report remains queued/);
    assert.deepEqual(h.requests, []);
    h.options.notify('Report queued');
    const proof = JSON.parse(
        h.logs[1].split('[E2E] presence-report-queued ')[1],
    );
    assert.deepEqual(proof, {
        count: 1,
        osmNodeId: payload.osm_node_id,
        response: 'not_there',
        platform: 'android_auto',
    });
});

test('ordinary confirmation submissions still use the presence API', async () => {
    const h = runtime('development');
    await h.options.send(payload);
    assert.equal(h.requests.length, 1);
    assert.equal(
        h.requests[0][0],
        'http://local.test/api/v1/alpr-presence-reports',
    );
    assert.deepEqual(JSON.parse(h.requests[0][1].body), payload);
});

test('E2E write diagnostics await encrypted persistence without exposing private values', async () => {
    let finish;
    const saved = [];
    const h = runtime('e2e', false, {
        save: (key, value) => {
            saved.push([key, value]);
            return new Promise((resolve) => {
                finish = resolve;
            });
        },
    });
    const pending = h.options.save('private-reporter-state');
    assert.deepEqual(saved, [
        ['driversagainstflock.alprPresence.v1', 'private-reporter-state'],
    ]);
    assert.deepEqual(h.logs, ['[E2E] presence-write-start:1']);
    finish();
    await pending;
    assert.deepEqual(h.logs, [
        '[E2E] presence-write-start:1',
        '[E2E] presence-write-complete:1',
    ]);
    assert.doesNotMatch(h.logs.join('\n'), /private-reporter-state/);
});

test('write diagnostics preserve storage rejection and the encrypted-storage requirement', async () => {
    const failed = runtime('e2e', false, {
        save: async () => {
            throw new Error('write failed');
        },
    });
    await assert.rejects(failed.options.save('private-state'), /write failed/);
    assert.deepEqual(failed.logs, ['[E2E] presence-write-start:1']);
    const unavailable = runtime('e2e', false, {
        encrypted: false,
        save: () => assert.fail('plaintext persistence is forbidden'),
    });
    assert.throws(
        () => unavailable.options.save('private-state'),
        /Encrypted storage unavailable/,
    );
});
