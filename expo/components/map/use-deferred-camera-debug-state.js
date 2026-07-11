import { useCallback, useEffect, useRef, useState } from 'react';

function requestFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(callback);
    }

    return setTimeout(callback, 0);
}

function cancelFrame(frame) {
    if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frame);
        return;
    }

    clearTimeout(frame);
}

export function useDeferredCameraDebugState(updatesEnabled) {
    const currentCameraDebugStateKeyRef = useRef('');
    const currentCameraDebugStateRef = useRef(null);
    const updatesEnabledRef = useRef(updatesEnabled);
    const updateFrameRef = useRef(null);
    const [currentCameraDebugState, setCurrentCameraDebugState] =
        useState(null);

    const cancelCameraDebugStateUpdate = useCallback(() => {
        if (updateFrameRef.current === null) {
            return;
        }

        cancelFrame(updateFrameRef.current);
        updateFrameRef.current = null;
    }, []);

    const flushCameraDebugState = useCallback(() => {
        updateFrameRef.current = null;

        if (!updatesEnabledRef.current) {
            return;
        }

        setCurrentCameraDebugState(currentCameraDebugStateRef.current);
    }, []);

    const scheduleCameraDebugStateUpdate = useCallback(() => {
        if (!updatesEnabledRef.current || updateFrameRef.current !== null) {
            return;
        }

        updateFrameRef.current = requestFrame(flushCameraDebugState);
    }, [flushCameraDebugState]);

    const setPendingCameraDebugState = useCallback(
        (nextCameraDebugState, nextCameraDebugStateKey) => {
            if (
                !nextCameraDebugState ||
                nextCameraDebugStateKey ===
                    currentCameraDebugStateKeyRef.current
            ) {
                return;
            }

            currentCameraDebugStateKeyRef.current = nextCameraDebugStateKey;
            currentCameraDebugStateRef.current = nextCameraDebugState;
            scheduleCameraDebugStateUpdate();
        },
        [scheduleCameraDebugStateUpdate],
    );

    useEffect(() => {
        updatesEnabledRef.current = updatesEnabled;

        if (updatesEnabled) {
            scheduleCameraDebugStateUpdate();
            return undefined;
        }

        cancelCameraDebugStateUpdate();
        setCurrentCameraDebugState(null);

        return undefined;
    }, [
        cancelCameraDebugStateUpdate,
        scheduleCameraDebugStateUpdate,
        updatesEnabled,
    ]);

    useEffect(
        () => () => {
            cancelCameraDebugStateUpdate();
        },
        [cancelCameraDebugStateUpdate],
    );

    return {
        currentCameraDebugState,
        setPendingCameraDebugState,
    };
}
