import { APP_ENVIRONMENT } from '../components/map/config';

function getPathFromURL(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

export function redirectSystemPath({ path }) {
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
