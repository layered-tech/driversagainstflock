import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { injectE2EMockSession } from '../../lib/auth';
import { setOSMApiMocksEnabled } from '../../lib/osm/api-mocks';
import {
    e2eMapApiMocksCanBeEnabled,
    setMapApiMocksEnabled,
} from '../map/api-mocks';

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

function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

function getE2EMockFlagsFromURL(value) {
    try {
        const url = new URL(value);
        const mocksAreEnabled =
            url.searchParams.get('e2eMapApiMocks') === '1' ||
            (url.protocol === 'driversagainstflock:' &&
                getDeepLinkPath(url) === 'e2e-mocks');

        return {
            authMockIsEnabled:
                mocksAreEnabled &&
                (url.searchParams.get('auth') === '1' ||
                    url.searchParams.get('e2eAuthMock') === '1'),
            mocksAreEnabled,
        };
    } catch {
        return {
            authMockIsEnabled: false,
            mocksAreEnabled: false,
        };
    }
}

function applyE2EMocksFromURL(value) {
    const { authMockIsEnabled, mocksAreEnabled } =
        getE2EMockFlagsFromURL(value);

    if (!mocksAreEnabled) {
        return;
    }

    setMapApiMocksEnabled(true);
    setOSMApiMocksEnabled(true);

    if (authMockIsEnabled) {
        injectE2EMockSession(E2E_MOCK_AUTH_SESSION);
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
