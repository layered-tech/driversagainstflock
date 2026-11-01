export function createAutomotiveSetupStore({
    read,
    write,
    search,
    resolvePlace,
    toSavedLocation,
    savePrimary,
    toggleFavorite,
    getSnapshot,
    matches,
}) {
    let writes = Promise.resolve();
    let request = null;
    return {
        async loadDraft() {
            try {
                const draft = JSON.parse((await read()) || '{}');
                return {
                    query: typeof draft.query === 'string' ? draft.query : '',
                    target: ['home', 'work', 'favorite'].includes(draft.target)
                        ? draft.target
                        : 'home',
                };
            } catch {
                return { query: '', target: 'home' };
            }
        },
        saveDraft(draft) {
            writes = writes
                .catch(() => {})
                .then(() => write(JSON.stringify(draft)));
            return writes;
        },
        cancelSearch() {
            request?.abort();
            request = null;
        },
        async search(query) {
            request?.abort();
            const controller = new AbortController();
            request = controller;
            const results = await search({
                textQuery: query.trim(),
                signal: controller.signal,
            });
            return request === controller ? results : null;
        },
        async save(target, result) {
            const place = result.place?.location
                ? result.place
                : await resolvePlace({ placeId: result.placeId || result.id });
            const location = toSavedLocation({ place, result });
            if (!location)
                throw new Error('This place has no usable location.');
            if (target === 'home' || target === 'work')
                return savePrimary(target, location);
            if (target !== 'favorite')
                throw new Error('Choose Home, Work, or Favorite.');
            if (
                !(getSnapshot()?.favoriteLocations ?? []).some((saved) =>
                    matches(saved, location),
                )
            ) {
                return toggleFavorite(location);
            }
        },
    };
}
