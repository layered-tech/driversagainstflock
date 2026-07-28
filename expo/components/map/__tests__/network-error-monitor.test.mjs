import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { installNetworkErrorMonitor } from '../../../lib/network-error-monitor.js';

describe('network error monitor', () => {
    test('reports every 4xx and 5xx response without query strings', async () => {
        const originalFetch = globalThis.fetch;
        const reports = [];
        const responses = [{ status: 200 }, { status: 404 }, { status: 503 }];

        globalThis.fetch = async () => responses.shift();

        try {
            assert.equal(
                installNetworkErrorMonitor({
                    onHttpError(report) {
                        reports.push(report);
                    },
                }),
                true,
            );

            const successfulResponse = await globalThis.fetch(
                'https://api.example.test/v1/roads?token=secret',
            );
            await globalThis.fetch(
                'https://api.example.test/v1/roads?token=secret',
            );
            await globalThis.fetch(
                new Request('https://api.example.test/v1/roads?token=secret'),
                { method: 'post' },
            );

            assert.equal(successfulResponse.status, 200);
            assert.deepEqual(reports, [
                {
                    method: 'GET',
                    status: 404,
                    url: 'https://api.example.test/v1/roads',
                },
                {
                    method: 'POST',
                    status: 503,
                    url: 'https://api.example.test/v1/roads',
                },
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
