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

export function waitForNativeCameraCommit() {
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

export function createLocationPuckCameraFallbackReleaseGate({
    waitForCameraCommit = waitForNativeCameraCommit,
} = {}) {
    let invalidated = false;
    let pendingRelease = null;

    function resolvePendingRelease(wasReleased = true) {
        const release = pendingRelease;

        if (!release) {
            return;
        }

        pendingRelease = null;
        release.resolve(wasReleased);
    }

    return {
        handleCameraCommit({ fallbackCameraIsFollowing }) {
            const release = pendingRelease;

            if (invalidated || !release) {
                return;
            }

            release.fallbackCameraIsFollowing = Boolean(
                fallbackCameraIsFollowing,
            );

            if (release.fallbackCameraIsFollowing) {
                release.commitGeneration += 1;
                release.waitingForCameraCommit = false;
                return;
            }

            if (release.waitingForCameraCommit) {
                return;
            }

            release.waitingForCameraCommit = true;
            const commitGeneration = ++release.commitGeneration;

            Promise.resolve()
                .then(() => waitForCameraCommit())
                .catch(() => false)
                .then(() => {
                    if (
                        invalidated ||
                        pendingRelease !== release ||
                        release.commitGeneration !== commitGeneration ||
                        release.fallbackCameraIsFollowing
                    ) {
                        return;
                    }

                    resolvePendingRelease();
                });
        },
        invalidate() {
            invalidated = true;

            if (!pendingRelease) {
                return;
            }

            const release = pendingRelease;

            pendingRelease = null;
            release.resolve(false);
        },
        cancel() {
            resolvePendingRelease(false);
        },
        release({ fallbackCameraIsFollowing }) {
            if (invalidated) {
                return Promise.resolve(false);
            }

            if (pendingRelease) {
                return pendingRelease.promise;
            }

            if (!fallbackCameraIsFollowing) {
                return Promise.resolve(true);
            }

            let resolveRelease;
            const promise = new Promise((resolve) => {
                resolveRelease = resolve;
            });

            pendingRelease = {
                commitGeneration: 0,
                fallbackCameraIsFollowing: true,
                promise,
                resolve: resolveRelease,
                waitingForCameraCommit: false,
            };

            return promise;
        },
    };
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
    let lastRequestedFollowIsEnabled = false;
    let lastRequestedMapViewCapture = null;
    let lastRequestedMapView = null;
    let operationQueue = Promise.resolve(false);
    let releasePromise = null;
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
        force = false,
        followProps,
        mapViewRef,
    }) {
        const enabled = followProps?.enabled === true;
        const mapView = captureMapView(mapViewRef);
        const requestKey = getFollowRequestKey(followProps, attachmentKey);
        const requestedMapView = mapView?.current ?? null;

        if (
            !force &&
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
        lastRequestedFollowIsEnabled = enabled;
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
        release({ attachmentKey, mapViewRef }) {
            if (invalidated) {
                return releasePromise ?? operationQueue;
            }

            const releaseRequestKey = getFollowRequestKey(
                { enabled: false },
                attachmentKey,
            );
            const requestedMapView =
                captureMapView(mapViewRef)?.current ?? null;

            if (
                releasePromise &&
                lastRequestKey === releaseRequestKey &&
                lastRequestedMapView === requestedMapView
            ) {
                return releasePromise;
            }

            if (
                status === 'inactive' &&
                configuredMapView === null &&
                !lastRequestedFollowIsEnabled
            ) {
                return operationQueue;
            }

            const nextReleasePromise = request({
                attachmentKey,
                followProps: { enabled: false },
                force: true,
                mapViewRef,
            }).finally(() => {
                if (releasePromise === nextReleasePromise) {
                    releasePromise = null;
                }
            });
            releasePromise = nextReleasePromise;

            return releasePromise;
        },
        request,
    };
}
