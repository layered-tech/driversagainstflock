import { APP_ENVIRONMENT } from '../auth/constants';
import { resolveOSMBaseURL } from './config-values.js';

export function getOSMBaseURL() {
    return resolveOSMBaseURL(
        process.env.EXPO_PUBLIC_OSM_BASE_URL,
        APP_ENVIRONMENT,
    );
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
