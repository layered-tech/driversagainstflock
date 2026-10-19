import { useEffect, useState } from 'react';
import Constants from 'expo-constants';

const NETWORK_DEBUG_STORE_KEY = '__dafNetworkDebugStore';
const MAX_NETWORK_DEBUG_REQUESTS = 20;

const APP_ENVIRONMENT =
    Constants.expoConfig?.extra?.environment ?? 'production';

export const NETWORK_DEBUG_IS_AVAILABLE =
    APP_ENVIRONMENT === 'development' || APP_ENVIRONMENT === 'staging';

function getNetworkDebugStore() {
    if (!globalThis[NETWORK_DEBUG_STORE_KEY]) {
        globalThis[NETWORK_DEBUG_STORE_KEY] = {
            fetchIsInstalled: false,
            listeners: new Set(),
            nextRequestId: 1,
            originalFetch: null,
            requests: [],
        };
    }

    return globalThis[NETWORK_DEBUG_STORE_KEY];
}

function getRequestURL(input) {
    if (typeof input === 'string') {
        return input;
    }

    if (input?.url) {
        return String(input.url);
    }

    if (input?.href) {
        return String(input.href);
    }

    return String(input ?? '');
}

function requestURLIsNetworkURL(url) {
    return /^https?:\/\//i.test(url);
}

function getTimestampMs() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function getNetworkDebugRequestsSnapshot() {
    return [...getNetworkDebugStore().requests];
}

function notifyNetworkDebugListeners() {
    const store = getNetworkDebugStore();
    const snapshot = getNetworkDebugRequestsSnapshot();

    store.listeners.forEach((listener) => {
        listener(snapshot);
    });
}

function logNetworkDebugRequest(request) {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;

    // Match existing network-error logging: omit query strings, fragments and credentials.
    const url = request.url
        .split(/[?#]/, 1)[0]
        .replace(/^(https?:\/\/)[^/]*@/i, '$1');
    const outcome =
        request.state === 'pending'
            ? 'START'
            : (request.errorName ??
              `${request.ok ? 'OK' : 'BAD'} ${request.status ?? ''}`.trim());
    const elapsed =
        request.durationMs === null ? '' : ` (${request.durationMs}ms)`;

    try {
        console.log(
            `[network #${request.id}] ${request.method} ${url} ${outcome}${elapsed}`,
        );
    } catch {}
}

function upsertNetworkDebugRequest(request) {
    const store = getNetworkDebugStore();
    const nextRequests = [
        request,
        ...store.requests.filter(
            (currentRequest) => currentRequest.id !== request.id,
        ),
    ].slice(0, MAX_NETWORK_DEBUG_REQUESTS);

    store.requests = nextRequests;
    logNetworkDebugRequest(request);
    notifyNetworkDebugListeners();
}

export function installNetworkDebugFetchMonitor() {
    if (!NETWORK_DEBUG_IS_AVAILABLE) {
        return;
    }

    const store = getNetworkDebugStore();

    if (store.fetchIsInstalled || typeof globalThis.fetch !== 'function') {
        return;
    }

    const originalFetch = globalThis.fetch.bind(globalThis);

    store.originalFetch = originalFetch;
    store.fetchIsInstalled = true;

    globalThis.fetch = async function networkDebugFetch(input, init) {
        const url = getRequestURL(input);

        if (!requestURLIsNetworkURL(url)) {
            return originalFetch(input, init);
        }

        const method = String(
            init?.method ?? input?.method ?? 'GET',
        ).toUpperCase();
        const id = store.nextRequestId;
        const startedAt = getTimestampMs();

        store.nextRequestId += 1;

        upsertNetworkDebugRequest({
            durationMs: null,
            method,
            status: null,
            id,
            ok: null,
            startedAt,
            state: 'pending',
            url,
        });

        try {
            const response = await originalFetch(input, init);
            const durationMs = Math.max(
                0,
                Math.round(getTimestampMs() - startedAt),
            );

            upsertNetworkDebugRequest({
                durationMs,
                method,
                status: response?.status ?? null,
                id,
                ok: Boolean(response?.ok),
                startedAt,
                state: 'complete',
                url,
            });

            return response;
        } catch (error) {
            const durationMs = Math.max(
                0,
                Math.round(getTimestampMs() - startedAt),
            );

            upsertNetworkDebugRequest({
                durationMs,
                method,
                status: null,
                errorName: (init?.signal ?? input?.signal)?.aborted
                    ? (init?.signal ?? input?.signal)?.reason?.name ===
                      'TimeoutError'
                        ? 'TIMEOUT'
                        : 'CANCELLED'
                    : (error?.name ?? 'NetworkError'),
                id,
                ok: false,
                startedAt,
                state: 'complete',
                url,
            });

            throw error;
        }
    };
}

export function subscribeToNetworkDebugRequests(listener) {
    const store = getNetworkDebugStore();

    store.listeners.add(listener);

    return () => {
        store.listeners.delete(listener);
    };
}

export function useNetworkDebugRequests() {
    const [requests, setRequests] = useState(getNetworkDebugRequestsSnapshot);

    useEffect(() => subscribeToNetworkDebugRequests(setRequests), []);

    return requests;
}
