import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
    AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
    AUTH_OAUTH_REQUEST_STORAGE_KEY,
    AUTH_STORAGE_TIMEOUT_MS,
    AUTH_TOKEN_STORAGE_KEY,
} from './constants';

function withTimeout(promise, timeoutMs, message) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

export async function getStoredToken() {
    if (Platform.OS === 'web') {
        globalThis.localStorage?.removeItem(
            AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
        );

        return globalThis.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? null;
    }

    forgetLegacyStoredToken();

    return withTimeout(
        SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY),
        AUTH_STORAGE_TIMEOUT_MS,
        'Saved login state could not be read.',
    );
}

export async function setStoredToken(token) {
    if (Platform.OS === 'web') {
        if (token) {
            globalThis.localStorage?.setItem(AUTH_TOKEN_STORAGE_KEY, token);
        } else {
            globalThis.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
            globalThis.localStorage?.removeItem(
                AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
            );
        }

        return;
    }

    if (token) {
        await withTimeout(
            SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token),
            AUTH_STORAGE_TIMEOUT_MS,
            'Login could not be saved.',
        );
    } else {
        await withTimeout(
            Promise.all([
                SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY),
                SecureStore.deleteItemAsync(
                    AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
                ),
            ]),
            AUTH_STORAGE_TIMEOUT_MS,
            'Saved login state could not be cleared.',
        );
    }
}

export function forgetLegacyStoredToken() {
    if (Platform.OS === 'web') {
        globalThis.localStorage?.removeItem(
            AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
        );
        return;
    }

    SecureStore.deleteItemAsync(AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY).catch(
        () => {},
    );
}

function parseStoredOAuthRequest(value) {
    if (!value) {
        return null;
    }

    try {
        const parsedValue = JSON.parse(value);

        if (parsedValue?.state) {
            return {
                codeVerifier: parsedValue.codeVerifier ?? null,
                state: parsedValue.state,
            };
        }
    } catch {}

    return {
        codeVerifier: null,
        state: value,
    };
}

export async function getStoredOAuthRequest() {
    if (Platform.OS === 'web') {
        return parseStoredOAuthRequest(
            globalThis.sessionStorage?.getItem(
                AUTH_OAUTH_REQUEST_STORAGE_KEY,
            ) ?? null,
        );
    }

    const storedRequest = await withTimeout(
        SecureStore.getItemAsync(AUTH_OAUTH_REQUEST_STORAGE_KEY),
        AUTH_STORAGE_TIMEOUT_MS,
        'Login state could not be read.',
    );

    return parseStoredOAuthRequest(storedRequest);
}

export async function setStoredOAuthRequest(request) {
    const storedRequest = request ? JSON.stringify(request) : null;

    if (Platform.OS === 'web') {
        if (storedRequest) {
            globalThis.sessionStorage?.setItem(
                AUTH_OAUTH_REQUEST_STORAGE_KEY,
                storedRequest,
            );
        } else {
            globalThis.sessionStorage?.removeItem(
                AUTH_OAUTH_REQUEST_STORAGE_KEY,
            );
        }

        return;
    }

    if (storedRequest) {
        await withTimeout(
            SecureStore.setItemAsync(
                AUTH_OAUTH_REQUEST_STORAGE_KEY,
                storedRequest,
            ),
            AUTH_STORAGE_TIMEOUT_MS,
            'Login state could not be saved.',
        );
    } else {
        await withTimeout(
            SecureStore.deleteItemAsync(AUTH_OAUTH_REQUEST_STORAGE_KEY),
            AUTH_STORAGE_TIMEOUT_MS,
            'Login state could not be cleared.',
        );
    }
}

export function forgetStoredOAuthRequest() {
    return setStoredOAuthRequest(null).catch(() => {});
}
