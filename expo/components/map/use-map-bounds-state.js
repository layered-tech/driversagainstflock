import { useCallback, useRef, useState } from 'react';
import { getCameraBoundsStateKey } from './camera-state';

export const MAP_BOUNDS_UPDATE_INTERVAL_MS = 500;

export function useMapBoundsState() {
    const currentMapBoundsKeyRef = useRef('');
    const currentMapBoundsUpdateTimeoutRef = useRef(null);
    const pendingCurrentMapBoundsRef = useRef(null);
    const [currentMapBounds, setCurrentMapBounds] = useState(null);

    const flushCurrentMapBoundsUpdate = useCallback(() => {
        currentMapBoundsUpdateTimeoutRef.current = null;

        const nextBounds = pendingCurrentMapBoundsRef.current;

        pendingCurrentMapBoundsRef.current = null;

        if (nextBounds) {
            setCurrentMapBounds(nextBounds);
        }
    }, []);

    const scheduleCurrentMapBoundsUpdate = useCallback(
        (bounds) => {
            pendingCurrentMapBoundsRef.current = bounds;

            if (currentMapBoundsUpdateTimeoutRef.current !== null) {
                return;
            }

            currentMapBoundsUpdateTimeoutRef.current = setTimeout(
                flushCurrentMapBoundsUpdate,
                MAP_BOUNDS_UPDATE_INTERVAL_MS,
            );
        },
        [flushCurrentMapBoundsUpdate],
    );

    const handleCurrentMapBoundsUpdate = useCallback(
        (bounds) => {
            const nextBoundsKey = getCameraBoundsStateKey(bounds);

            if (nextBoundsKey === currentMapBoundsKeyRef.current) {
                return;
            }

            currentMapBoundsKeyRef.current = nextBoundsKey;
            scheduleCurrentMapBoundsUpdate(bounds);
        },
        [scheduleCurrentMapBoundsUpdate],
    );

    const cancelCurrentMapBoundsUpdate = useCallback(() => {
        if (currentMapBoundsUpdateTimeoutRef.current === null) {
            return;
        }

        clearTimeout(currentMapBoundsUpdateTimeoutRef.current);
        currentMapBoundsUpdateTimeoutRef.current = null;
    }, []);

    return {
        cancelCurrentMapBoundsUpdate,
        currentMapBounds,
        handleCurrentMapBoundsUpdate,
    };
}
