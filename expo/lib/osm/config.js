const IS_PRODUCTION = process.env.APP_ENV === 'production';

export const OSM_PRODUCTION_BASE_URL = 'https://www.openstreetmap.org';
export const OSM_DEV_BASE_URL = 'https://api06.dev.openstreetmap.org';

export function getOSMBaseURL() {
    const configuredBaseURL = process.env.EXPO_PUBLIC_OSM_BASE_URL?.trim();

    if (configuredBaseURL) {
        return configuredBaseURL.replace(/\/+$/, '');
    }

    if (IS_PRODUCTION) {
        return OSM_PRODUCTION_BASE_URL;
    }

    return OSM_DEV_BASE_URL;
}

export function getOSMOAuthAuthorizationURL() {
    return `${getOSMBaseURL()}/oauth2/authorize`;
}

export function getOSMOAuthTokenURL() {
    return `${getOSMBaseURL()}/oauth2/token`;
}

export function getOSMOAuthUserinfoURL() {
    return `${getOSMBaseURL()}/oauth2/userinfo`;
}

export function getOSMApiBaseURL() {
    return `${getOSMBaseURL()}/api/0.6`;
}
