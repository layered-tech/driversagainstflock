import { AUTH_REQUEST_TIMEOUT_MS } from './constants';

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
    const controller = new AbortController();
    const timeoutId = setTimeout(
        () => controller.abort(),
        AUTH_REQUEST_TIMEOUT_MS,
    );

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('The server did not respond. Please try again.');
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
