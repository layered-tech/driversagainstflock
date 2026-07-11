import { useCallback, useRef } from 'react';

const DRIVING_MODE_EXIT_CAMERA_RETRY_DELAY_MS = 80;
const DRIVING_MODE_EXIT_CAMERA_RETRY_WINDOW_MS = 1000;

export function useDrivingModeExitCameraRetry({ cameraRef, isMapReadyRef }) {
    const retryFrameRef = useRef(null);
    const retryStartedAtRef = useRef(0);
    const retryTimeoutRef = useRef(null);

    const clearDrivingModeExitCameraRetry = useCallback(() => {
        if (retryFrameRef.current !== null) {
            cancelAnimationFrame(retryFrameRef.current);
            retryFrameRef.current = null;
        }

        if (retryTimeoutRef.current !== null) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
    }, []);

    // RNMapbox can ignore imperative camera stops while native follow mode is
    // being disabled, so retry once the updated Camera props have flushed.
    const scheduleDrivingModeExitCameraRetry = useCallback(
        (cameraStop) => {
            clearDrivingModeExitCameraRetry();

            const retryCameraStop = { ...cameraStop };
            const retryCamera = () => {
                if (isMapReadyRef.current && cameraRef.current) {
                    cameraRef.current.setCamera(retryCameraStop);
                }
            };

            retryFrameRef.current = requestAnimationFrame(() => {
                retryFrameRef.current = null;
                retryCamera();

                retryTimeoutRef.current = setTimeout(() => {
                    retryTimeoutRef.current = null;
                    retryCamera();
                }, DRIVING_MODE_EXIT_CAMERA_RETRY_DELAY_MS);
            });
        },
        [cameraRef, clearDrivingModeExitCameraRetry, isMapReadyRef],
    );

    const markDrivingModeExitCameraRetryWindowStarted = useCallback(() => {
        retryStartedAtRef.current = Date.now();
    }, []);

    const consumeDrivingModeExitCameraRetry = useCallback(() => {
        const startedAt = retryStartedAtRef.current;

        if (
            startedAt <= 0 ||
            Date.now() - startedAt > DRIVING_MODE_EXIT_CAMERA_RETRY_WINDOW_MS
        ) {
            return false;
        }

        retryStartedAtRef.current = 0;
        return true;
    }, []);

    return {
        clearDrivingModeExitCameraRetry,
        consumeDrivingModeExitCameraRetry,
        markDrivingModeExitCameraRetryWindowStarted,
        scheduleDrivingModeExitCameraRetry,
    };
}
