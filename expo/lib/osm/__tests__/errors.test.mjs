import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    OSM_ERROR_CODES,
    OSMApiError,
    throwOSMResponseError,
} from '../errors.js';

function fakeResponse(status, body = 'detail text') {
    return {
        status,
        text: () => Promise.resolve(body),
    };
}

async function captureError(response) {
    try {
        await throwOSMResponseError(response);
    } catch (error) {
        return error;
    }

    throw new Error('throwOSMResponseError did not throw');
}

describe('throwOSMResponseError', () => {
    const statusCases = [
        [400, OSM_ERROR_CODES.badRequest],
        [401, OSM_ERROR_CODES.unauthorized],
        [403, OSM_ERROR_CODES.forbidden],
        [409, OSM_ERROR_CODES.conflict],
        [413, OSM_ERROR_CODES.tooLarge],
        [429, OSM_ERROR_CODES.rateLimited],
        [500, OSM_ERROR_CODES.server],
        [502, OSM_ERROR_CODES.server],
        [418, OSM_ERROR_CODES.server],
    ];

    for (const [status, expectedCode] of statusCases) {
        test(`maps HTTP ${status} to '${expectedCode}'`, async () => {
            const error = await captureError(fakeResponse(status));

            assert.ok(error instanceof OSMApiError);
            assert.equal(error.code, expectedCode);
            assert.equal(error.status, status);
        });
    }

    test('captures the response body as detail', async () => {
        const error = await captureError(
            fakeResponse(409, 'The changeset 42 was closed at 2026-07-11.'),
        );

        assert.equal(
            error.detail,
            'The changeset 42 was closed at 2026-07-11.',
        );
    });

    test('falls back to an empty detail when the body is unreadable', async () => {
        const error = await captureError({
            status: 401,
            text: () => Promise.reject(new Error('boom')),
        });

        assert.equal(error.detail, '');
        assert.equal(error.code, OSM_ERROR_CODES.unauthorized);
    });
});

describe('OSMApiError', () => {
    test('carries a user-presentable message per code', () => {
        const error = new OSMApiError({
            code: OSM_ERROR_CODES.unauthorized,
            status: 401,
        });

        assert.equal(error.name, 'OSMApiError');
        assert.match(error.message, /sign in again/);
    });

    test('falls back to the server message for unknown codes', () => {
        const error = new OSMApiError({ code: 'not-a-real-code' });

        assert.match(error.message, /OpenStreetMap had a problem/);
    });
});
