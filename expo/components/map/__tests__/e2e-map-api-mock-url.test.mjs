import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getE2EMockFlagsFromURL } from '../../root/e2e-map-api-mock-url.js';

describe('E2E map API mock links', () => {
    test('defaults mocked flows to a signed-out session', () => {
        assert.deepEqual(
            getE2EMockFlagsFromURL('driversagainstflock://e2e-mocks'),
            {
                authMockIsDisabled: true,
                authMockIsEnabled: false,
                mocksAreEnabled: true,
            },
        );
    });

    test('supports explicit signed-in and signed-out sessions', () => {
        assert.deepEqual(
            getE2EMockFlagsFromURL('driversagainstflock://e2e-mocks?auth=1'),
            {
                authMockIsDisabled: false,
                authMockIsEnabled: true,
                mocksAreEnabled: true,
            },
        );
        assert.deepEqual(
            getE2EMockFlagsFromURL('driversagainstflock://e2e-mocks?auth=0'),
            {
                authMockIsDisabled: true,
                authMockIsEnabled: false,
                mocksAreEnabled: true,
            },
        );
    });

    test('does not enable auth mocks for unrelated links', () => {
        assert.deepEqual(
            getE2EMockFlagsFromURL('driversagainstflock://map?auth=1'),
            {
                authMockIsDisabled: false,
                authMockIsEnabled: false,
                mocksAreEnabled: false,
            },
        );
    });
});
