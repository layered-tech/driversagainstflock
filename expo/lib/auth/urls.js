import { APP_ENVIRONMENT } from './constants';

function trimTrailingSlashes(value) {
    return value.replace(/\/+$/, '');
}

export function getApiBaseURL() {
    const configuredBaseURL = process.env.EXPO_PUBLIC_API_BASE_URL;

    if (configuredBaseURL) {
        return trimTrailingSlashes(configuredBaseURL);
    }

    if (APP_ENVIRONMENT === 'development') {
        return 'http://127.0.0.1:8000/api';
    }

    if (APP_ENVIRONMENT === 'staging') {
        return 'https://staging.driversagainstflock.com/api';
    }

    return 'https://driversagainstflock.com/api';
}

function buildURL(baseURL, path, params = {}) {
    const queryString = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join('&');
    const normalizedPath = path.replace(/^\/+/, '');

    return `${baseURL}/${normalizedPath}${queryString ? `?${queryString}` : ''}`;
}

export function buildApiURL(path, params = {}) {
    return buildURL(getApiBaseURL(), path, params);
}
