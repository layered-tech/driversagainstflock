import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const source = transformSync(
    readFileSync(new URL('../api.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
    },
).code;
const sessionSource = readFileSync(
    new URL('../road-matching-session.js', import.meta.url),
    'utf8',
);

function createDeferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setImmediate(resolve));
    }

    assert.fail('Timed out waiting for the corridor request.');
}

function createHarness(fetch) {
    const timers = new Map();
    let now = 0;
    let nextTimerId = 0;
    const module = { exports: {} };
    const modules = {
        '../../lib/sentry': { addSentryBreadcrumb() {} },
        './api-mocks': { mapApiMocksAreEnabled: () => false },
        './config': {
            buildApiURL: () => 'https://example.test/v1/road-corridor',
        },
        './geo': {
            getStoredNumber(value) {
                const number = Number(value);

                return Number.isFinite(number) ? number : null;
            },
            normalizeLongitude: (longitude) => longitude,
        },
    };

    new Function(
        'require',
        'module',
        'exports',
        'fetch',
        'setTimeout',
        'clearTimeout',
        source,
    )(
        (specifier) => modules[specifier] ?? {},
        module,
        module.exports,
        fetch,
        (callback, delay) => {
            const id = ++nextTimerId;
            timers.set(id, { callback, dueAt: now + delay });

            return id;
        },
        (id) => timers.delete(id),
    );

    return {
        advance(ms) {
            now += ms;

            for (const [id, timer] of timers) {
                if (timer.dueAt <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        },
        getRoadCorridor: module.exports.getRoadCorridor,
        pendingTimers: () => timers.size,
    };
}

function corridorResponse(id) {
    return {
        ok: true,
        async json() {
            return {
                result: {
                    ways: [
                        {
                            coordinates: [
                                [-87, 41],
                                [-86.999, 41],
                            ],
                            id,
                        },
                    ],
                },
            };
        },
    };
}

const location = { latitude: 41, longitude: -87 };

describe('road corridor request retry', () => {
    test('fits two attempts inside the road graph request deadline', () => {
        const attemptTimeout = Number(
            source.match(/ROAD_CORRIDOR_RESPONSE_TIMEOUT_MS = (\d+)/)?.[1],
        );
        const requestDeadline = Number(
            sessionSource.match(
                /ROAD_CORRIDOR_REQUEST_TIMEOUT_MS = (\d+)/,
            )?.[1],
        );

        assert.ok(Number.isFinite(attemptTimeout));
        assert.ok(Number.isFinite(requestDeadline));
        assert.ok(attemptTimeout * 2 < requestDeadline);
    });

    test('retries once after 10 seconds without a response', async () => {
        const firstResponse = createDeferred();
        const requests = [];
        const harness = createHarness((_url, options) => {
            requests.push(options);

            return requests.length === 1
                ? firstResponse.promise
                : Promise.resolve(corridorResponse('retry'));
        });
        const result = harness.getRoadCorridor({ location });

        harness.advance(9999);
        assert.equal(requests.length, 1);
        harness.advance(1);
        await waitFor(() => requests.length === 2);

        assert.equal(requests.length, 2);
        assert.equal(requests[0].signal.aborted, true);
        assert.deepEqual(
            (await result).map((way) => way.id),
            ['retry'],
        );
        assert.equal(harness.pendingTimers(), 0);

        firstResponse.resolve(corridorResponse('stale'));
    });

    test('stops after a second unanswered request', async () => {
        const requests = [];
        const harness = createHarness((_url, options) => {
            requests.push(options);

            return new Promise(() => {});
        });
        const result = harness.getRoadCorridor({ location });

        harness.advance(10000);
        await waitFor(() => requests.length === 2);
        harness.advance(10000);
        await assert.rejects(result, { name: 'TimeoutError' });

        assert.equal(requests.length, 2);
        assert.equal(requests[1].signal.aborted, true);
        assert.equal(harness.pendingTimers(), 0);
    });

    test('does not retry a prompt server error', async () => {
        let requestCount = 0;
        const harness = createHarness(async () => {
            requestCount += 1;

            return {
                ok: false,
                async json() {
                    return { error: 'Road corridor could not be loaded.' };
                },
            };
        });

        await assert.rejects(
            harness.getRoadCorridor({ location }),
            /Road corridor could not be loaded/,
        );
        harness.advance(10000);

        assert.equal(requestCount, 1);
        assert.equal(harness.pendingTimers(), 0);
    });

    test('does not retry after the caller cancels', async () => {
        const requests = [];
        const harness = createHarness((_url, options) => {
            requests.push(options);

            return new Promise(() => {});
        });
        const controller = new AbortController();
        const result = harness.getRoadCorridor({
            location,
            signal: controller.signal,
        });

        controller.abort();
        await assert.rejects(result, { name: 'AbortError' });
        harness.advance(10000);

        assert.equal(requests.length, 1);
        assert.equal(requests[0].signal.aborted, true);
        assert.equal(harness.pendingTimers(), 0);
    });
});
