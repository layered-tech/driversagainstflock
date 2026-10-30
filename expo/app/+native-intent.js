import { APP_ENVIRONMENT } from '../components/map/config';
import {
    getE2EAndroidAutoCommandFromURL,
    getE2ECarPlayCommandFromURL,
    isE2ELiveGpsDriveResetURL,
} from '../components/root/e2e-map-api-mock-url';

function getPathFromURL(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

export function redirectSystemPath({ path }) {
    if (
        APP_ENVIRONMENT === 'e2e' &&
        (getE2ECarPlayCommandFromURL(path) ||
            getE2EAndroidAutoCommandFromURL(path))
    )
        return '/';
    try {
        const url = new URL(path);
        const deepLinkPath = getPathFromURL(url);
        const hasCallbackPayload =
            url.searchParams.has('code') || url.searchParams.has('error');

        if (
            (APP_ENVIRONMENT === 'e2e' || APP_ENVIRONMENT === 'development') &&
            url.protocol === 'driversagainstflock:' &&
            deepLinkPath === 'e2e-mocks'
        ) {
            if (isE2ELiveGpsDriveResetURL(path)) return '/';
            return url.searchParams.get('auth') === '1'
                ? '/?e2eMapApiMocks=1&e2eAuthMock=1'
                : '/?e2eMapApiMocks=1';
        }

        if (
            url.protocol === 'driversagainstflock:' &&
            deepLinkPath === 'oauth' &&
            hasCallbackPayload
        ) {
            return `/${url.search}`;
        }
    } catch {
        return path;
    }

    return path;
}
