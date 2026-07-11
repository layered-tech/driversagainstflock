import Constants from 'expo-constants';

export const AUTH_OAUTH_REQUEST_STORAGE_KEY =
    'driversagainstflock.openStreetMapOAuthRequest.v1';
export const AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY =
    'driversagainstflock.authToken.v1';
export const AUTH_TOKEN_STORAGE_KEY =
    'driversagainstflock.openStreetMapAccessToken.v1';
export const AUTH_CALLBACK_URL = 'driversagainstflock://oauth';
export const AUTH_REQUEST_TIMEOUT_MS = 15000;
export const AUTH_STORAGE_TIMEOUT_MS = 5000;
export const APP_ENVIRONMENT =
    Constants.expoConfig?.extra?.environment ?? 'production';
export const OPENSTREETMAP_AUTHORIZATION_URL =
    'https://www.openstreetmap.org/oauth2/authorize';
export const OPENSTREETMAP_TOKEN_URL =
    'https://www.openstreetmap.org/oauth2/token';
export const OPENSTREETMAP_USERINFO_URL =
    'https://www.openstreetmap.org/oauth2/userinfo';
