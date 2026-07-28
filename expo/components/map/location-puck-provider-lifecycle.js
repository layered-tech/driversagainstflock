function captureMapView(mapViewRef) {
    const mapView =
        mapViewRef && typeof mapViewRef === 'object' && 'current' in mapViewRef
            ? mapViewRef.current
            : mapViewRef;

    return mapView ? Object.freeze({ current: mapView }) : null;
}

export const LOCATION_PUCK_PROVIDER_FALLBACK_RETRY_DELAY_MS = 2_000;

function captureProviderLocation(providerLocation) {
    const coordinate = providerLocation?.coordinate;

    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return null;
    }

    return Object.freeze({
        coordinate: Object.freeze([longitude, latitude]),
        heading: providerLocation?.heading,
        recordedAt: providerLocation?.recordedAt,
    });
}

function mapViewsAreEqual(firstMapView, secondMapView) {
    return firstMapView?.current === secondMapView?.current;
}

function attachmentsAreEqual(
    firstAttachmentKey,
    firstMapView,
    secondAttachmentKey,
    secondMapView,
) {
    return (
        firstAttachmentKey === secondAttachmentKey &&
        mapViewsAreEqual(firstMapView, secondMapView)
    );
}

function createPendingRequest(request) {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return {
        ...request,
        coalescedResolvers: [],
        promise,
        resolve,
    };
}

export function createLocationPuckProviderLifecycle({
    clearLocationPuck,
    fallbackRetryDelayMs = LOCATION_PUCK_PROVIDER_FALLBACK_RETRY_DELAY_MS,
    now = Date.now,
    onStatusChange = () => {},
    updateLocationPuck,
}) {
    let configuredMapView = null;
    let disableGeneration = 0;
    let drainPromise = null;
    let fallbackAttachmentKey = null;
    let fallbackMapView = null;
    let fallbackRetryNotBefore = 0;
    let inFlightRequest = null;
    let invalidated = false;
    let invalidationPromise = null;
    let latestRequest = null;
    let pendingAfterDisableRequest = null;
    let pendingRequest = null;
    let possiblyOwnedMapView = null;
    let requestSequence = 0;
    let status = 'inactive';

    function setStatus(nextStatus) {
        if (invalidated || status === nextStatus) {
            return;
        }

        status = nextStatus;
        onStatusChange(nextStatus);
    }

    function settleRequest(request, result) {
        if (!request) {
            return;
        }

        request.resolve(result);
        request.coalescedResolvers.forEach((resolve) => resolve(result));
    }

    function replacePendingRequest(key, nextRequest) {
        const currentRequest =
            key === 'after-disable'
                ? pendingAfterDisableRequest
                : pendingRequest;

        settleRequest(currentRequest, false);

        if (key === 'after-disable') {
            pendingAfterDisableRequest = nextRequest;
        } else {
            pendingRequest = nextRequest;
        }
    }

    async function clearMapView(mapView) {
        if (!mapView) {
            return false;
        }

        try {
            return Boolean(await clearLocationPuck(mapView));
        } catch {
            return false;
        }
    }

    function latestRequestMatchesAttachment(request) {
        return Boolean(
            latestRequest?.enabled &&
            latestRequest.disableGeneration === request.disableGeneration &&
            attachmentsAreEqual(
                latestRequest.attachmentKey,
                latestRequest.mapView,
                request.attachmentKey,
                request.mapView,
            ),
        );
    }

    async function processDisabledRequest() {
        const mapViewToClear = configuredMapView ?? possiblyOwnedMapView;

        await clearMapView(mapViewToClear);

        configuredMapView = null;
        fallbackAttachmentKey = null;
        fallbackMapView = null;
        fallbackRetryNotBefore = 0;
        possiblyOwnedMapView = null;

        if (!latestRequest?.enabled) {
            setStatus('inactive');
        }

        return true;
    }

    async function processEnabledRequest(request) {
        if (
            status === 'fallback' &&
            attachmentsAreEqual(
                fallbackAttachmentKey,
                fallbackMapView,
                request.attachmentKey,
                request.mapView,
            )
        ) {
            return false;
        }

        const mapViewChanged = Boolean(
            configuredMapView &&
            !mapViewsAreEqual(configuredMapView, request.mapView),
        );

        if (mapViewChanged) {
            const previousMapView = configuredMapView;

            await clearMapView(previousMapView);

            if (mapViewsAreEqual(configuredMapView, previousMapView)) {
                configuredMapView = null;
            }
        }

        if (invalidated) {
            return false;
        }

        if (latestRequest?.id !== request.id) {
            return false;
        }

        if (!request.mapView || !request.location) {
            if (!configuredMapView && latestRequestMatchesAttachment(request)) {
                setStatus('inactive');
            }

            return false;
        }

        if (
            !configuredMapView &&
            latestRequestMatchesAttachment(request) &&
            status !== 'native'
        ) {
            setStatus('pending');
        }

        possiblyOwnedMapView = request.mapView;

        let wasUpdated = false;

        try {
            wasUpdated = Boolean(
                await updateLocationPuck(request.mapView, request.location),
            );
        } catch {
            wasUpdated = false;
        }

        if (wasUpdated) {
            configuredMapView = request.mapView;
        }

        if (invalidated) {
            return false;
        }

        if (wasUpdated) {
            possiblyOwnedMapView = null;

            if (latestRequestMatchesAttachment(request)) {
                fallbackAttachmentKey = null;
                fallbackMapView = null;
                fallbackRetryNotBefore = 0;
                setStatus('native');
            }

            return true;
        }

        if (latestRequest?.disableGeneration !== request.disableGeneration) {
            return false;
        }

        configuredMapView = null;

        if (latestRequestMatchesAttachment(request)) {
            setStatus('recovering');
        }

        await clearMapView(request.mapView);
        possiblyOwnedMapView = null;

        if (invalidated) {
            return false;
        }

        if (latestRequestMatchesAttachment(request)) {
            fallbackAttachmentKey = request.attachmentKey;
            fallbackMapView = request.mapView;
            fallbackRetryNotBefore =
                now() + Math.max(0, Number(fallbackRetryDelayMs) || 0);
            setStatus('fallback');
        }

        return false;
    }

    async function processRequest(request) {
        return request.enabled
            ? processEnabledRequest(request)
            : processDisabledRequest();
    }

    function moveAfterDisableRequestIntoPending() {
        if (!pendingRequest && pendingAfterDisableRequest) {
            pendingRequest = pendingAfterDisableRequest;
            pendingAfterDisableRequest = null;
        }
    }

    function scheduleDrain() {
        if (drainPromise || invalidated) {
            return;
        }

        drainPromise = Promise.resolve()
            .then(async () => {
                while (!invalidated) {
                    moveAfterDisableRequestIntoPending();

                    if (!pendingRequest) {
                        return;
                    }

                    const request = pendingRequest;

                    pendingRequest = null;
                    inFlightRequest = request;

                    const result = await processRequest(request);

                    inFlightRequest = null;
                    settleRequest(request, result);

                    if (!request.enabled) {
                        moveAfterDisableRequestIntoPending();
                    }
                }
            })
            .catch(() => false)
            .finally(() => {
                drainPromise = null;

                if (
                    !invalidated &&
                    (pendingRequest || pendingAfterDisableRequest)
                ) {
                    scheduleDrain();
                }
            });
    }

    function enqueueRequest(request) {
        const pending = createPendingRequest(request);
        const disableBarrierIsPending = Boolean(
            inFlightRequest?.enabled === false ||
            pendingRequest?.enabled === false,
        );

        if (!pending.enabled) {
            setStatus('clearing');

            if (inFlightRequest?.enabled === false) {
                settleRequest(pendingAfterDisableRequest, false);
                pendingAfterDisableRequest = null;
                inFlightRequest.coalescedResolvers.push(pending.resolve);
                return pending.promise;
            }

            if (pendingRequest?.enabled === false) {
                settleRequest(pendingAfterDisableRequest, false);
                pendingAfterDisableRequest = null;
                pendingRequest.coalescedResolvers.push(pending.resolve);
                return pending.promise;
            }

            settleRequest(pendingAfterDisableRequest, false);
            pendingAfterDisableRequest = null;
            replacePendingRequest('pending', pending);
        } else if (disableBarrierIsPending) {
            replacePendingRequest('after-disable', pending);
        } else {
            replacePendingRequest('pending', pending);
        }

        scheduleDrain();

        return pending.promise;
    }

    function request({ attachmentKey, enabled, mapViewRef, providerLocation }) {
        if (invalidated) {
            return Promise.resolve(false);
        }

        const requestIsEnabled = enabled === true;

        if (!requestIsEnabled) {
            disableGeneration += 1;
        }

        const nextRequest = {
            attachmentKey,
            disableGeneration,
            enabled: requestIsEnabled,
            id: requestSequence + 1,
            location: captureProviderLocation(providerLocation),
            mapView: captureMapView(mapViewRef),
        };

        requestSequence = nextRequest.id;
        latestRequest = nextRequest;

        if (
            nextRequest.enabled &&
            status === 'fallback' &&
            attachmentsAreEqual(
                fallbackAttachmentKey,
                fallbackMapView,
                nextRequest.attachmentKey,
                nextRequest.mapView,
            )
        ) {
            if (!nextRequest.location || now() < fallbackRetryNotBefore) {
                return Promise.resolve(false);
            }
        }

        if (nextRequest.enabled && status === 'fallback') {
            setStatus('preparing-native');
            return Promise.resolve(false);
        }

        return enqueueRequest(nextRequest);
    }

    return {
        getStatus: () => status,
        invalidate() {
            if (invalidationPromise) {
                return invalidationPromise;
            }

            invalidated = true;
            settleRequest(pendingRequest, false);
            settleRequest(pendingAfterDisableRequest, false);
            pendingRequest = null;
            pendingAfterDisableRequest = null;

            invalidationPromise = Promise.resolve(drainPromise)
                .catch(() => false)
                .then(async () => {
                    const mapViewToClear =
                        configuredMapView ?? possiblyOwnedMapView;

                    configuredMapView = null;
                    fallbackAttachmentKey = null;
                    fallbackMapView = null;
                    fallbackRetryNotBefore = 0;
                    possiblyOwnedMapView = null;

                    return clearMapView(mapViewToClear);
                });

            return invalidationPromise;
        },
        request,
    };
}
