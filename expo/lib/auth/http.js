import { AUTH_REQUEST_TIMEOUT_MS } from './request-constants.js';

export async function readJSONResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message =
            data.error_description ||
            data.error ||
            data.message ||
            Object.values(data.errors ?? {})?.flat()?.[0] ||
            'Request failed';

        throw new Error(message);
    }

    return data;
}

export async function fetchWithTimeout(url, options = {}) {
    const {
        signal: callerSignal,
        timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
        ...fetchOptions
    } = options;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();

    if (callerSignal?.aborted) {
        abortFromCaller();
    } else {
        callerSignal?.addEventListener('abort', abortFromCaller, {
            once: true,
        });
    }

    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
        });
    } catch (error) {
        if (error.name === 'AbortError' && timedOut) {
            throw new Error('The server did not respond. Please try again.');
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', abortFromCaller);
    }
}
