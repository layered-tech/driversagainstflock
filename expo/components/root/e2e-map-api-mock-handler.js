import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import {
    e2eMapApiMocksCanBeEnabled,
    setMapApiMocksEnabled,
} from '../map/api-mocks';

function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

function e2eMapApiMocksURLIsEnabled(value) {
    try {
        const url = new URL(value);

        return (
            url.searchParams.get('e2eMapApiMocks') === '1' ||
            (url.protocol === 'driversagainstflock:' &&
                getDeepLinkPath(url) === 'e2e-mocks')
        );
    } catch {
        return false;
    }
}

export function E2EMapApiMockHandler() {
    useEffect(() => {
        if (!e2eMapApiMocksCanBeEnabled()) {
            return undefined;
        }

        Linking.getInitialURL()
            .then((url) => {
                if (url && e2eMapApiMocksURLIsEnabled(url)) {
                    setMapApiMocksEnabled(true);
                }
            })
            .catch(() => {});

        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (e2eMapApiMocksURLIsEnabled(url)) {
                setMapApiMocksEnabled(true);
            }
        });

        return () => {
            subscription.remove();
        };
    }, []);

    return null;
}
