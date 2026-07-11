import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
    AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
    AUTH_OAUTH_REQUEST_STORAGE_KEY,
    AUTH_SESSION_STORAGE_KEY,
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

function parseStoredAuth(value) {
    if (!value) {
        return null;
    }

    try {
        const parsedValue = JSON.parse(value);

        if (parsedValue?.accessToken) {
            return {
                accessToken: parsedValue.accessToken,
                obtainedAt: parsedValue.obtainedAt ?? null,
                scopes: Array.isArray(parsedValue.scopes)
                    ? parsedValue.scopes
                    : [],
            };
        }
    } catch {}

    return null;
}

function buildMigratedAuth(legacyToken) {
    if (!legacyToken) {
        return null;
    }

    return {
        accessToken: legacyToken,
        obtainedAt: null,
        scopes: ['openid'],
    };
}

export async function getStoredAuth() {
    if (Platform.OS === 'web') {
        globalThis.localStorage?.removeItem(
            AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
        );

        const storedAuth = parseStoredAuth(
            globalThis.localStorage?.getItem(AUTH_SESSION_STORAGE_KEY) ?? null,
        );

        if (storedAuth) {
            return storedAuth;
        }

        const migratedAuth = buildMigratedAuth(
            globalThis.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? null,
        );

        if (migratedAuth) {
            globalThis.localStorage?.setItem(
                AUTH_SESSION_STORAGE_KEY,
                JSON.stringify(migratedAuth),
            );
            globalThis.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
        }

        return migratedAuth;
    }

    forgetLegacyStoredToken();

    const storedAuth = parseStoredAuth(
        await withTimeout(
            SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY),
            AUTH_STORAGE_TIMEOUT_MS,
            'Saved login state could not be read.',
        ),
    );

    if (storedAuth) {
        return storedAuth;
    }

    const migratedAuth = buildMigratedAuth(
        await withTimeout(
            SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY),
            AUTH_STORAGE_TIMEOUT_MS,
            'Saved login state could not be read.',
        ),
    );

    if (migratedAuth) {
        await withTimeout(
            SecureStore.setItemAsync(
                AUTH_SESSION_STORAGE_KEY,
                JSON.stringify(migratedAuth),
            ),
            AUTH_STORAGE_TIMEOUT_MS,
            'Login could not be saved.',
        );
        SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY).catch(() => {});
    }

    return migratedAuth;
}

export async function setStoredAuth(auth) {
    const storedAuth = auth ? JSON.stringify(auth) : null;

    if (Platform.OS === 'web') {
        if (storedAuth) {
            globalThis.localStorage?.setItem(
                AUTH_SESSION_STORAGE_KEY,
                storedAuth,
            );
            globalThis.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
        } else {
            globalThis.localStorage?.removeItem(AUTH_SESSION_STORAGE_KEY);
            globalThis.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
            globalThis.localStorage?.removeItem(
                AUTH_LEGACY_BACKEND_TOKEN_STORAGE_KEY,
            );
        }

        return;
    }

    if (storedAuth) {
        await withTimeout(
            SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, storedAuth),
            AUTH_STORAGE_TIMEOUT_MS,
            'Login could not be saved.',
        );
        SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY).catch(() => {});
    } else {
        await withTimeout(
            Promise.all([
                SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY),
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
                scopes: parsedValue.scopes ?? null,
                state: parsedValue.state,
            };
        }
    } catch {}

    return {
        codeVerifier: null,
        scopes: null,
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
