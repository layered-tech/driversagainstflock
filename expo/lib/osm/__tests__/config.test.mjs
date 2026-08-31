import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveOSMBaseURL } from '../config-values.js';

describe('resolveOSMBaseURL', () => {
    test('uses production OpenStreetMap when the override is omitted in production', () => {
        assert.equal(
            resolveOSMBaseURL(undefined, 'production'),
            'https://www.openstreetmap.org',
        );
    });

    test('uses the development OpenStreetMap host outside production', () => {
        for (const environment of ['development', 'e2e', 'staging']) {
            assert.equal(
                resolveOSMBaseURL('', environment),
                'https://api06.dev.openstreetmap.org',
            );
        }
    });

    test('trims whitespace and trailing slashes from an override', () => {
        assert.equal(
            resolveOSMBaseURL(' https://example.test/// ', 'production'),
            'https://example.test',
        );
    });

    test('rejects an override that is not an HTTP URL', () => {
        assert.throws(
            () => resolveOSMBaseURL('ftp://example.test', 'production'),
            /valid HTTP URL/,
        );
        assert.throws(
            () => resolveOSMBaseURL('not a URL', 'production'),
            /valid HTTP URL/,
        );
    });
});
