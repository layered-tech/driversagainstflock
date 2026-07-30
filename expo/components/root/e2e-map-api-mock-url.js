function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

const E2E_DRIVING_ALERT_FIXTURES = new Set(['alpr', 'combined', 'police']);

export function getE2EMockFlagsFromURL(value) {
    try {
        const url = new URL(value);
        const mocksAreEnabled =
            url.searchParams.get('e2eMapApiMocks') === '1' ||
            (url.protocol === 'driversagainstflock:' &&
                getDeepLinkPath(url) === 'e2e-mocks');
        const authMockValue =
            url.searchParams.get('auth') ?? url.searchParams.get('e2eAuthMock');
        const authMockIsEnabled = mocksAreEnabled && authMockValue === '1';
        const requestedDrivingAlertsFixture =
            url.searchParams.get('drivingAlerts');
        const drivingAlertsFixture =
            mocksAreEnabled &&
            E2E_DRIVING_ALERT_FIXTURES.has(requestedDrivingAlertsFixture)
                ? requestedDrivingAlertsFixture
                : null;

        return {
            authMockIsDisabled: mocksAreEnabled && !authMockIsEnabled,
            authMockIsEnabled,
            drivingAlertsFixture,
            mocksAreEnabled,
        };
    } catch {
        return {
            authMockIsDisabled: false,
            authMockIsEnabled: false,
            drivingAlertsFixture: null,
            mocksAreEnabled: false,
        };
    }
}
