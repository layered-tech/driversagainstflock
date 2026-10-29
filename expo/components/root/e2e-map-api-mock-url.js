import { scorecardDriveE2EScenarioIsSupported } from '../map/scorecard-drive-e2e-fixture.js';

function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

export function getE2ECarPlayCommandFromURL(value) {
    try {
        const url = new URL(value);
        if (
            url.protocol !== 'driversagainstflock:' ||
            getDeepLinkPath(url) !== 'e2e-carplay'
        )
            return null;
        const command = url.searchParams.get('command');
        const transcript = url.searchParams.get('transcript');
        const locations = url.searchParams.get('locations');
        if (
            ![
                'seed',
                'state',
                'route-render',
                'voice',
                'reset',
                'locations',
            ].includes(command) ||
            (command === 'locations' &&
                !['both', 'home', 'work', 'none'].includes(locations)) ||
            (command === 'voice' &&
                !['Walmart', 'Walmart Delafield'].includes(transcript))
        )
            return null;
        return {
            requestType: 'carplay',
            query: JSON.stringify({ command, transcript, locations }),
        };
    } catch {
        return null;
    }
}

export function getE2EAndroidAutoCommandFromURL(value) {
    try {
        const url = new URL(value);
        if (
            url.protocol !== 'driversagainstflock:' ||
            getDeepLinkPath(url) !== 'e2e-android-auto'
        )
            return null;
        const command = url.searchParams.get('command');
        const locations = url.searchParams.get('locations');
        const query = url.searchParams.get('query');
        if (
            ![
                'seed',
                'state',
                'route-render',
                'reset',
                'locations',
                'search',
            ].includes(command) ||
            (command === 'locations' &&
                !['both', 'home', 'work', 'none'].includes(locations)) ||
            (command === 'search' &&
                !['Walmart', 'Walmart Delafield'].includes(query))
        )
            return null;
        return {
            requestType: 'android-auto',
            query: JSON.stringify({ command, locations, query }),
        };
    } catch {
        return null;
    }
}

const E2E_DRIVING_ALERT_FIXTURES = new Set(['alpr', 'combined', 'police']);
const E2E_AUTO_PLAY_REQUEST_TYPES = new Set([
    'presence',
    'map-view',
    'directions',
    'navigation',
    'search',
]);

export function isE2ELiveGpsDriveResetURL(value) {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'driversagainstflock:' &&
            getDeepLinkPath(url) === 'e2e-mocks' &&
            url.searchParams.get('liveGpsDrive') === 'reset'
        );
    } catch {
        return false;
    }
}

export function getE2EMockFlagsFromURL(value) {
    try {
        const url = new URL(value);
        const mocksAreEnabled =
            !isE2ELiveGpsDriveResetURL(value) &&
            (url.searchParams.get('e2eMapApiMocks') === '1' ||
                (url.protocol === 'driversagainstflock:' &&
                    getDeepLinkPath(url) === 'e2e-mocks'));
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

        if (
            !E2E_AUTO_PLAY_REQUEST_TYPES.has(requestType) ||
            !query ||
            (requestType === 'map-view' && query !== 'toggle')
        ) {
            return null;
        }

        return { query, requestType };
    } catch {
        return null;
    }
}
