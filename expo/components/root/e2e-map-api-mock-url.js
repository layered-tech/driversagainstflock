import { scorecardDriveE2EScenarioIsSupported } from '../map/scorecard-drive-e2e-fixture.js';

function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

const E2E_DRIVING_ALERT_FIXTURES = new Set(['alpr', 'combined', 'police']);
const E2E_AUTO_PLAY_REQUEST_TYPES = new Set([
    'directions',
    'navigation',
    'search',
]);

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
        const requestedScorecardDriveScenario =
            url.searchParams.get('scorecardDrive');
        const scorecardDriveScenario =
            mocksAreEnabled &&
            scorecardDriveE2EScenarioIsSupported(
                requestedScorecardDriveScenario,
            )
                ? requestedScorecardDriveScenario
                : null;

        return {
            authMockIsDisabled: mocksAreEnabled && !authMockIsEnabled,
            authMockIsEnabled,
            drivingAlertsFixture,
            mocksAreEnabled,
            scorecardDriveScenario,
        };
    } catch {
        return {
            authMockIsDisabled: false,
            authMockIsEnabled: false,
            drivingAlertsFixture: null,
            mocksAreEnabled: false,
            scorecardDriveScenario: null,
        };
    }
}

export function getE2EAutoPlayCommandFromURL(value) {
    const { mocksAreEnabled } = getE2EMockFlagsFromURL(value);

    if (!mocksAreEnabled) {
        return null;
    }

    try {
        const url = new URL(value);
        const requestType = url.searchParams.get('autoPlayRequestType');
        const query = String(url.searchParams.get('query') ?? '').trim();

        if (!E2E_AUTO_PLAY_REQUEST_TYPES.has(requestType) || !query) {
            return null;
        }

        return { query, requestType };
    } catch {
        return null;
    }
}
