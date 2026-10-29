const AUTOCOMPLETE_DEBOUNCE_MS = 250;

export function createAutoPlayPlaceSearch({
    createSessionToken,
    getLocation,
    minQueryLength,
    onError,
    onLoading,
    onResults,
    searchPlaces,
    searchTextPlaces,
}) {
    let generation = 0;
    let timer = null;
    let abortController = null;
    let sessionToken = null;

    const cancelRequest = () => {
        generation += 1;
        clearTimeout(timer);
        timer = null;
        abortController?.abort();
        abortController = null;
    };
    const run = async (query, submitted, requestGeneration) => {
        const controller = new AbortController();
        abortController = controller;
        const isCurrent = () => generation === requestGeneration;

        try {
            const location = await getLocation();
            if (!isCurrent()) {
                return;
            }

            const results = submitted
                ? await searchTextPlaces({
                      location,
                      signal: controller.signal,
                      textQuery: query,
                  })
                : await searchPlaces({
                      input: query,
                      location,
                      sessionToken,
                      signal: controller.signal,
                  });

            if (isCurrent()) {
                await onResults(results, query, submitted);
            }
        } catch (error) {
            if (isCurrent() && error?.name !== 'AbortError') {
                onError(error);
            }
        } finally {
            if (abortController === controller) {
                abortController = null;
            }
        }
    };
    const search = (text, submitted) => {
        cancelRequest();
        const query = String(text ?? '').trim();
        if (query.length < minQueryLength) {
            sessionToken = null;
            return Promise.resolve();
        }

        sessionToken ??= createSessionToken();
        const requestGeneration = generation;
        if (submitted) {
            onLoading(query);
            sessionToken = null;
            return run(query, true, requestGeneration);
        }

        // CarPlay completes each edit once; a loading row would consume the
        // callback before the actual autocomplete suggestions arrive.
        timer = setTimeout(() => {
            timer = null;
            void run(query, false, requestGeneration);
        }, AUTOCOMPLETE_DEBOUNCE_MS);
        return Promise.resolve();
    };

    return {
        cancel() {
            cancelRequest();
            sessionToken = null;
        },
        change: (text) => search(text, false),
        submit: (text) => search(text, true),
    };
}
