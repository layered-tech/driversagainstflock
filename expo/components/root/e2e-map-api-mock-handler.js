import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { injectE2EMockSession } from '../../lib/auth';
import { setOSMApiMocksEnabled } from '../../lib/osm/api-mocks';
import { dispatchAutoPlayE2ECommand } from '../auto-play';
import {
    e2eMapApiMocksCanBeEnabled,
    setMapApiMocksEnabled,
} from '../map/api-mocks';
import { setE2EDrivingAlertsFixture } from '../map/e2e-driving-alert-fixture';
import {
    getE2EAutoPlayCommandFromURL,
    getE2EMockFlagsFromURL,
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
    const {
        authMockIsDisabled,
        authMockIsEnabled,
        drivingAlertsFixture,
        mocksAreEnabled,
    } = getE2EMockFlagsFromURL(value);

    if (!mocksAreEnabled) {
        return;
    }

    setMapApiMocksEnabled(true);
    setOSMApiMocksEnabled(true);
    setE2EDrivingAlertsFixture(drivingAlertsFixture);

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
