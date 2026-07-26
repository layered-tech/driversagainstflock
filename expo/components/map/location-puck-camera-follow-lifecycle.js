function captureMapView(mapViewRef) {
    const mapView =
        mapViewRef && typeof mapViewRef === 'object' && 'current' in mapViewRef
            ? mapViewRef.current
            : mapViewRef;

    return mapView ? Object.freeze({ current: mapView }) : null;
}

function getFollowRequestKey(followProps, attachmentKey) {
    const padding = followProps?.padding;

    return [
        attachmentKey,
        followProps?.enabled === true,
        followProps?.zoomLevel ?? '',
        followProps?.pitch ?? '',
        padding?.paddingTop ?? 0,
        padding?.paddingLeft ?? 0,
        padding?.paddingBottom ?? 0,
        padding?.paddingRight ?? 0,
    ].join(':');
}

function waitForNativeCameraCommit() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
            setTimeout(resolve, 0);
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        });
    });
}

export function getLocationPuckCameraFollowFallbackProps({
    followProps,
    followUserMode,
    nativeFollowIsSupported,
    nativeFollowStatus,
    platform,
}) {
    if (nativeFollowIsSupported && nativeFollowStatus !== 'failed') {
        return { followUserLocation: false };
    }

    return {
        followPadding:
            platform === 'android' ? undefined : followProps?.padding,
        followPitch: followProps?.pitch,
        followUserLocation: followProps?.enabled === true,
        followUserMode,
        followZoomLevel: followProps?.zoomLevel,
    };
}

export function getLocationPuckCameraControllerKey({
    nativeFollowIsSupported,
    nativeFollowStatus,
}) {
    return nativeFollowIsSupported && nativeFollowStatus !== 'failed'
        ? 'native-location-puck-camera'
        : 'mapbox-location-puck-camera-fallback';
}

export function createLocationPuckCameraFollowLifecycle({
    configureCameraFollow,
    onStatusChange = () => {},
    verifyCameraFollow = async () => true,
    waitForCameraCommit = waitForNativeCameraCommit,
}) {
    let configuredMapView = null;
    let failedAttachmentKey = null;
    let failedMapView = null;
    let generation = 0;
    let invalidated = false;
    let lastRequestKey = null;
    let lastRequestedMapViewCapture = null;
    let lastRequestedMapView = null;
    let operationQueue = Promise.resolve(false);
    let status = 'inactive';

    function setStatus(nextStatus) {
        if (invalidated || status === nextStatus) {
            return;
        }

        status = nextStatus;
        onStatusChange(nextStatus);
    }

    function enqueue(operation) {
        const result = operationQueue
            .then(operation, operation)
            .catch(() => false);

        operationQueue = result;

        return result;
    }

    async function disableCameraFollow(mapView) {
        if (!mapView) {
            return false;
        }

        try {
            return Boolean(
                await configureCameraFollow(mapView, { enabled: false }),
            );
        } catch {
            return false;
        }
    }

    async function configureAndVerifyCameraFollow(mapView, followProps) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            let wasConfigured = false;

            try {
                wasConfigured = Boolean(
                    await configureCameraFollow(mapView, followProps),
                );
            } catch {
                wasConfigured = false;
            }

            if (!wasConfigured) {
                return false;
            }

            try {
                await waitForCameraCommit();

                if (await verifyCameraFollow(mapView)) {
                    return true;
                }
            } catch {
                // The next bounded attempt performs a fresh native handoff.
            }
        }

        return false;
    }

    function request({
        attachmentKey,
        cameraIsPrepared = false,
        followProps,
        mapViewRef,
    }) {
        const enabled = followProps?.enabled === true;
        const mapView = captureMapView(mapViewRef);
        const requestKey = getFollowRequestKey(followProps, attachmentKey);
        const requestedMapView = mapView?.current ?? null;

        if (
            lastRequestKey === requestKey &&
            lastRequestedMapView === requestedMapView
        ) {
            return operationQueue;
        }

        if (
            enabled &&
            status === 'failed' &&
            failedAttachmentKey === attachmentKey &&
            failedMapView === requestedMapView
        ) {
            return operationQueue;
        }

        if (enabled && status === 'failed') {
            setStatus('preparing-native');

            return operationQueue;
        }

        if (enabled && status === 'preparing-native' && !cameraIsPrepared) {
            return operationQueue;
        }

        const operationGeneration = generation + 1;

        generation = operationGeneration;
        lastRequestKey = requestKey;
        lastRequestedMapViewCapture = mapView;
        lastRequestedMapView = requestedMapView;

        return enqueue(async () => {
            if (invalidated) {
                return false;
            }

            if (!enabled) {
                const mapViewToDisable =
                    configuredMapView ?? mapView ?? lastRequestedMapViewCapture;

                configuredMapView = null;
                failedAttachmentKey = null;
                failedMapView = null;

                if (mapViewToDisable) {
                    setStatus('clearing');
                }

                await disableCameraFollow(mapViewToDisable);

                if (operationGeneration === generation) {
                    setStatus('inactive');
                }

                return true;
            }

            if (operationGeneration !== generation) {
                return false;
            }

            if (!mapView) {
                failedAttachmentKey = attachmentKey;
                failedMapView = requestedMapView;
                setStatus('failed');
                return false;
            }

            setStatus('activating');

            if (
                configuredMapView &&
                configuredMapView.current !== mapView.current
            ) {
                await disableCameraFollow(configuredMapView);
            }

            const wasConfigured = await configureAndVerifyCameraFollow(
                mapView,
                followProps,
            );

            // A native implementation can partially enter follow before
            // returning false or throwing. Finish an explicit idle handoff
            // before exposing declarative fallback or processing a new view.
            if (!wasConfigured) {
                await disableCameraFollow(mapView);
            }

            // Record ownership even when a newer request arrived while the
            // native handoff was in flight. The queued request can then
            // explicitly idle this map before attaching the replacement.
            if (wasConfigured) {
                configuredMapView = mapView;
            }

            if (operationGeneration !== generation || invalidated) {
                return wasConfigured;
            }

            configuredMapView = wasConfigured ? mapView : null;
            failedAttachmentKey = wasConfigured ? null : attachmentKey;
            failedMapView = wasConfigured ? null : requestedMapView;
            setStatus(wasConfigured ? 'active' : 'failed');

            return wasConfigured;
        });
    }

    return {
        getStatus: () => status,
        invalidate() {
            const fallbackMapViewToDisable =
                configuredMapView ?? lastRequestedMapViewCapture;

            generation += 1;
            invalidated = true;
            failedAttachmentKey = null;
            failedMapView = null;

            return enqueue(async () => {
                const mapViewToDisable =
                    configuredMapView ?? fallbackMapViewToDisable;

                configuredMapView = null;

                if (!mapViewToDisable) {
                    return false;
                }

                return disableCameraFollow(mapViewToDisable);
            });
        },
        request,
    };
}
