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

function runtime(environment, mocks = false) {
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
        '../../lib/private-cache-storage': {},
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
