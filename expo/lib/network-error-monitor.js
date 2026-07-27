const NETWORK_ERROR_MONITOR_STORE_KEY = '__dafNetworkErrorMonitorStore';

function getNetworkErrorMonitorStore() {
    if (!globalThis[NETWORK_ERROR_MONITOR_STORE_KEY]) {
        globalThis[NETWORK_ERROR_MONITOR_STORE_KEY] = {
            fetchIsInstalled: false,
        };
    }

    return globalThis[NETWORK_ERROR_MONITOR_STORE_KEY];
}

function getRequestMethod(input, init) {
    const method = init?.method ?? input?.method ?? 'GET';

    return String(method).toUpperCase();
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

function stripRequestURLSearchAndHash(url) {
    const searchIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');
    const endIndex = [searchIndex, hashIndex]
        .filter((index) => index >= 0)
        .sort((first, second) => first - second)[0];

    return endIndex === undefined ? url : url.slice(0, endIndex);
}

function isErrorResponse(response) {
    const status = Number(response?.status);

    return Number.isInteger(status) && status >= 400 && status < 600;
}

export function installNetworkErrorMonitor({ onHttpError } = {}) {
    const store = getNetworkErrorMonitorStore();

    if (
        store.fetchIsInstalled ||
        typeof globalThis.fetch !== 'function' ||
        typeof onHttpError !== 'function'
    ) {
        return false;
    }

    const originalFetch = globalThis.fetch.bind(globalThis);

    store.fetchIsInstalled = true;
    globalThis.fetch = async function networkErrorMonitorFetch(input, init) {
        const response = await originalFetch(input, init);

        if (isErrorResponse(response)) {
            try {
                onHttpError({
                    method: getRequestMethod(input, init),
                    status: Number(response.status),
                    url: stripRequestURLSearchAndHash(getRequestURL(input)),
                });
            } catch {}
        }

        return response;
    };

    return true;
}
