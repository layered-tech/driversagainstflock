import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { injectE2EMockSession } from '../../lib/auth';
import { setOSMApiMocksEnabled } from '../../lib/osm/api-mocks';
import { dispatchAutoPlayE2ECommand } from '../auto-play';
import { presenceCoordinator } from '../map/alpr-presence-runtime';
import {
    e2eMapApiMocksCanBeEnabled,
    setMapApiMocksEnabled,
} from '../map/api-mocks';
import { setE2EDrivingAlertsFixture } from '../map/e2e-driving-alert-fixture';
import { APP_ENVIRONMENT } from '../map/config';
import { getSharedElectronicHorizonAlprNodes } from '../map/electronic-horizon-alpr-store';
import {
    getLastRoadLookAheadAsync,
    getRoadMatchingSessionDiagnostics,
    invalidateRoadMatchingGraphForE2E,
} from '../map/road-matching-session';
import { upcomingAlertDebugStore } from '../map/upcoming-alert-debug';
import {
    scorecardDriveE2ECameraInventoryIsReady,
    setScorecardDriveE2EScenario,
} from '../map/scorecard-drive-e2e-fixture';
import {
    getE2EAndroidAutoCommandFromURL,
    getE2EAutoPlayCommandFromURL,
    getE2ECarPlayCommandFromURL,
    getE2EMockFlagsFromURL,
    isE2ELiveGpsDriveResetURL,
} from './e2e-map-api-mock-url';

const E2E_MOCK_AUTH_SESSION = {
    accessToken: 'e2e-mock-token',
    scopes: ['openid', 'write_api'],
    user: {
        id: 'e2e',
        name: 'daf_mapper',
        openStreetMapId: 'e2e',
        provider: 'openstreetmap',
    },
};

function applyE2EMocksFromURL(value) {
    const automotiveCommand =
        getE2ECarPlayCommandFromURL(value) ??
        getE2EAndroidAutoCommandFromURL(value);
    if (automotiveCommand && APP_ENVIRONMENT === 'e2e') {
        void Promise.resolve(
            dispatchAutoPlayE2ECommand(automotiveCommand),
        ).catch((error) =>
            console.info(
                `[E2E] ${automotiveCommand.requestType}-command-failed:${error.message}`,
            ),
        );
        return;
    }
    if (isE2ELiveGpsDriveResetURL(value)) {
        setMapApiMocksEnabled(false);
        setOSMApiMocksEnabled(false);
        void presenceCoordinator
            .resetLimits()
            .then(() => presenceCoordinator.resetAutomotiveAlertHistory())
            .then(async () => {
                console.info(
                    '[E2E] live-gps-drive-state ' +
                        JSON.stringify({
                            environment: APP_ENVIRONMENT,
                            queuedReports:
                                presenceCoordinator.state.outbox.length,
                        }),
                );
                console.info('[E2E] live-gps-drive-reset');
                if (APP_ENVIRONMENT === 'e2e') {
                    const horizon = await getLastRoadLookAheadAsync();
                    console.info(
                        '[E2E] live-gps-drive-diagnostics ' +
                            JSON.stringify({
                                road: getRoadMatchingSessionDiagnostics(),
                                horizonPointCount:
                                    horizon?.primaryPath?.coordinates?.length ??
                                    0,
                                warning: upcomingAlertDebugStore.getSnapshot(),
                            }),
                    );
                }
            })
            .catch((error) =>
                console.info(`[E2E] live-gps-drive-failed:${error.message}`),
            );
        return;
    }
    const {
        authMockIsDisabled,
        authMockIsEnabled,
        drivingAlertsFixture,
        mocksAreEnabled,
        scorecardDriveScenario,
    } = getE2EMockFlagsFromURL(value);

    if (!mocksAreEnabled) {
        return;
    }

    setMapApiMocksEnabled(true);
    setOSMApiMocksEnabled(true);
    setE2EDrivingAlertsFixture(drivingAlertsFixture);
    setScorecardDriveE2EScenario(scorecardDriveScenario);
    if (scorecardDriveScenario) invalidateRoadMatchingGraphForE2E();

    if (
        scorecardDriveScenario &&
        scorecardDriveE2ECameraInventoryIsReady(
            getSharedElectronicHorizonAlprNodes(),
        )
    ) {
        console.info('[E2E] scorecard-camera-inventory-ready');
    }

    if (scorecardDriveScenario) {
        console.info('[E2E] scorecard-drive-scenario-ready');
    }

    if (authMockIsEnabled) {
        injectE2EMockSession(E2E_MOCK_AUTH_SESSION);
    } else if (authMockIsDisabled) {
        injectE2EMockSession(null);
    }

    const autoPlayCommand = getE2EAutoPlayCommandFromURL(value);

    if (autoPlayCommand) {
        dispatchAutoPlayE2ECommand(autoPlayCommand);
    }
}

export function E2EMapApiMockHandler() {
    useEffect(() => {
        if (!e2eMapApiMocksCanBeEnabled()) {
            return undefined;
        }

        Linking.getInitialURL()
            .then((url) => {
                if (url) {
                    applyE2EMocksFromURL(url);
                }
            })
            .catch(() => {});

        const subscription = Linking.addEventListener('url', ({ url }) => {
            applyE2EMocksFromURL(url);
        });

        return () => {
            subscription.remove();
        };
    }, []);

    return null;
}
