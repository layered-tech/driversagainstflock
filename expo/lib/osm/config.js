export function getOSMBaseURL() {
    const configuredBaseURL = process.env.EXPO_PUBLIC_OSM_BASE_URL?.trim();

    return configuredBaseURL.replace(/\/+$/, '');
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
