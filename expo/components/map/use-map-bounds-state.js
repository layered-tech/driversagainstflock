import { useCallback, useRef, useState } from 'react';
import { getCameraBoundsStateKey } from './camera-state';

export function useMapBoundsState() {
    const currentMapBoundsKeyRef = useRef('');
    const currentMapBoundsUpdateFrameRef = useRef(null);
    const pendingCurrentMapBoundsRef = useRef(null);
    const [currentMapBounds, setCurrentMapBounds] = useState(null);

    const flushCurrentMapBoundsUpdate = useCallback(() => {
        currentMapBoundsUpdateFrameRef.current = null;

        const nextBounds = pendingCurrentMapBoundsRef.current;

        pendingCurrentMapBoundsRef.current = null;

        if (nextBounds) {
            setCurrentMapBounds(nextBounds);
        }
    }, []);

    const scheduleCurrentMapBoundsUpdate = useCallback(
        (bounds) => {
            pendingCurrentMapBoundsRef.current = bounds;

            if (currentMapBoundsUpdateFrameRef.current !== null) {
                return;
            }

            currentMapBoundsUpdateFrameRef.current = requestAnimationFrame(
                flushCurrentMapBoundsUpdate,
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
        if (currentMapBoundsUpdateFrameRef.current === null) {
            return;
        }

        cancelAnimationFrame(currentMapBoundsUpdateFrameRef.current);
        currentMapBoundsUpdateFrameRef.current = null;
    }, []);

    return {
        cancelCurrentMapBoundsUpdate,
        currentMapBounds,
        handleCurrentMapBoundsUpdate,
    };
}
