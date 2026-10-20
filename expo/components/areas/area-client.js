export function createAreaClient({
    buildURL,
    fetchRequest,
    storage,
    timeoutMs = 15000,
}) {
    let tokenPromise;
    async function request(path, options = {}) {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        if (options.signal?.aborted) controller.abort();
        options.signal?.addEventListener('abort', cancel);
        const timeout = setTimeout(cancel, timeoutMs);
        try {
            const response = await fetchRequest(buildURL(path), {
                ...options,
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(
                    response.status >= 500
                        ? 'Area updates are unavailable right now. Please try again.'
                        : (Object.values(body.errors ?? {}).flat()[0] ??
                              body.message ??
                              'Your areas could not be loaded. Please try again.'),
                );
                error.status = response.status;
                throw error;
            }
            return body;
        } catch (error) {
            if (controller.signal.aborted && !options.signal?.aborted)
                throw new Error(
                    'The request took too long. Check your connection and try again.',
                );
            throw error;
        } finally {
            clearTimeout(timeout);
            options.signal?.removeEventListener('abort', cancel);
        }
    }
    async function deviceToken() {
        if (!tokenPromise) {
            tokenPromise = (async () => {
                const token = await storage.get();
                if (token) return token;
                const result = await request('v1/area-devices', {
                    method: 'POST',
                });
                await storage.set(result.token);
                return result.token;
            })().catch((error) => {
                tokenPromise = null;
                throw error;
            });
        }
        return tokenPromise;
    }
    return async function areaRequest(
        path = '',
        { method = 'GET', body, signal } = {},
    ) {
        const token = await deviceToken();
        try {
            return await request(`v1/areas${path}`, {
                method,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal,
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (error) {
            if (error.status === 401) {
                tokenPromise = null;
                await storage.clear();
                throw new Error(
                    'This phone’s subscription session expired. Reopen My areas to start again.',
                );
            }
            throw error;
        }
    };
}
