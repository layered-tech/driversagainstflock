import { useCallback, useEffect, useRef, useState } from 'react';
import { areaRequest } from './areas-api';
import { mergeAreaChanges } from './area-geometry';
import { useAreas } from './areas-context';

export function useAreaFeed(areaId, window = '7') {
    const { rememberAreaBoundary } = useAreas();
    const [payload, setPayload] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const controller = useRef(null);
    const load = useCallback(
        async (page = 1) => {
            controller.current?.abort();
            const request = new AbortController();
            controller.current = request;
            setLoading(true);
            setError(null);
            try {
                const result = await areaRequest(
                    `/${areaId}/changes?window=${window}&page=${page}`,
                    { signal: request.signal },
                );
                if (!request.signal.aborted) {
                    rememberAreaBoundary(result.area);
                    setPayload((current) => ({
                        ...result,
                        changes: {
                            ...result.changes,
                            data:
                                page === 1
                                    ? result.changes.data
                                    : mergeAreaChanges(
                                          current?.changes.data ?? [],
                                          result.changes.data,
                                      ),
                        },
                    }));
                }
            } catch (failure) {
                if (!request.signal.aborted) setError(failure.message);
            } finally {
                if (!request.signal.aborted) setLoading(false);
            }
        },
        [areaId, window, rememberAreaBoundary],
    );
    useEffect(() => {
        setPayload(null);
        load();
        return () => controller.current?.abort();
    }, [load]);
    return {
        payload,
        error,
        loading,
        reload: load,
        loadMore: () => load((payload?.changes.current_page ?? 0) + 1),
    };
}
