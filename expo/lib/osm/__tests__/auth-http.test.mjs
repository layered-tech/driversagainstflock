import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { fetchWithTimeout } from '../../auth/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('fetchWithTimeout', () => {
    test('preserves a caller abort instead of reporting a timeout', async () => {
        const callerController = new AbortController();

        globalThis.fetch = async (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                if (signal.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }

                signal.addEventListener(
                    'abort',
                    () => reject(new DOMException('Aborted', 'AbortError')),
                    { once: true },
                );
            });

        const request = fetchWithTimeout('https://example.test', {
            signal: callerController.signal,
            timeoutMs: 1_000,
        });

        callerController.abort();

        await assert.rejects(request, { name: 'AbortError' });
    });

    test('continues to translate its own deadline into a user-facing error', async () => {
        globalThis.fetch = async (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener(
                    'abort',
                    () => reject(new DOMException('Aborted', 'AbortError')),
                    { once: true },
                );
            });

        await assert.rejects(
            fetchWithTimeout('https://example.test', { timeoutMs: 1 }),
            /The server did not respond/,
        );
    });

    test('removes the caller abort listener after a successful request', async () => {
        let addedListener = null;
        let removedListener = null;
        const callerSignal = {
            aborted: false,
            addEventListener(_event, listener) {
                addedListener = listener;
            },
            removeEventListener(_event, listener) {
                removedListener = listener;
            },
        };

        globalThis.fetch = async () => ({ ok: true });

        await fetchWithTimeout('https://example.test', {
            signal: callerSignal,
            timeoutMs: 1_000,
        });

        assert.equal(typeof addedListener, 'function');
        assert.equal(removedListener, addedListener);
    });
});
