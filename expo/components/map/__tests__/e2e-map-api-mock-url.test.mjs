import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getE2EAutoPlayCommandFromURL,
    getE2EMockFlagsFromURL,
} from '../../root/e2e-map-api-mock-url.js';

describe('E2E map API mock links', () => {
    test('defaults mocked flows to a signed-out session', () => {
        assert.deepEqual(
            getE2EMockFlagsFromURL('driversagainstflock://e2e-mocks'),
            {
                authMockIsDisabled: true,
                authMockIsEnabled: false,
                drivingAlertsFixture: null,
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
                drivingAlertsFixture: null,
                mocksAreEnabled: true,
            },
        );
        assert.deepEqual(
            getE2EMockFlagsFromURL('driversagainstflock://e2e-mocks?auth=0'),
            {
                authMockIsDisabled: true,
                authMockIsEnabled: false,
                drivingAlertsFixture: null,
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
                drivingAlertsFixture: null,
                mocksAreEnabled: false,
            },
        );
    });

    test('accepts a driving-alert fixture only from an enabled mock link', () => {
        assert.equal(
            getE2EMockFlagsFromURL(
                'driversagainstflock://e2e-mocks?drivingAlerts=combined',
            ).drivingAlertsFixture,
            'combined',
        );
        assert.equal(
            getE2EMockFlagsFromURL(
                'driversagainstflock://map?drivingAlerts=combined',
            ).drivingAlertsFixture,
            null,
        );
    });
});

describe('Android Auto E2E commands', () => {
    test('parses deterministic search, directions, and navigation requests', () => {
        for (const requestType of ['search', 'directions', 'navigation']) {
            assert.deepEqual(
                getE2EAutoPlayCommandFromURL(
                    `driversagainstflock://e2e-mocks?autoPlayRequestType=${requestType}&query=%20Austin%20Central%20Library%20`,
                ),
                {
                    query: 'Austin Central Library',
                    requestType,
                },
            );
        }
    });

    test('rejects unrelated, incomplete, and unsupported requests', () => {
        for (const value of [
            'driversagainstflock://map?autoPlayRequestType=navigation&query=Austin',
            'driversagainstflock://e2e-mocks?query=Austin',
            'driversagainstflock://e2e-mocks?autoPlayRequestType=navigation&query=%20',
            'driversagainstflock://e2e-mocks?autoPlayRequestType=add-a-stop&query=Austin',
            'not a URL',
        ]) {
            assert.equal(getE2EAutoPlayCommandFromURL(value), null);
        }
    });
});
