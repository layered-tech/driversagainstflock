import { useRef, useSyncExternalStore } from 'react';
import {
    getPrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import { createMarkerCache, MARKER_CACHE_FRESH_MS } from './marker-cache';
import { addCrashlyticsLog } from '../../lib/crashlytics';
import { getMockMarkerPoints, mapApiMocksAreEnabled } from './api-mocks';
import { buildApiURL } from './config';
import {
    MARKER_LOAD_DEBOUNCE_MS,
    MARKER_LOADING_MIN_VISIBLE_MS,
} from './constants';
import {
    expandBoundsForMarkerRequest,
    getMarkerBoundsKey,
    getMarkerRequestBoundsSpan,
    markerRequestBoundsAreLoadable,
    markerRequestBoundsContainCameraBounds,
    shouldSkipMarkerLoadRequest,
} from './geo';
import { upsertMarkerPointList } from './marker-point-merge';

const cacheKey = `driversagainstflock.markers.v1.${buildApiURL('markers')}`;
const markerCache = createMarkerCache({
    read: () => getPrivateCacheItem(cacheKey),
    write: (value) => setPrivateCacheItem(cacheKey, value),
});
const inFlightMarkerRequests = new Set();
let markerCacheRevision = 0;

const MARKER_REQUEST_BOUND_KEYS = ['sw_lng', 'sw_lat', 'ne_lng', 'ne_lat'];

function getValidMarkerRequestBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') {
        return null;
    }

    const markerRequestBounds = Object.fromEntries(
        MARKER_REQUEST_BOUND_KEYS.map((key) => [key, Number(bounds[key])]),
    );
    const hasEveryBound = MARKER_REQUEST_BOUND_KEYS.every((key) =>
        Number.isFinite(markerRequestBounds[key]),
    );

    return hasEveryBound ? markerRequestBounds : null;
}

function buildMarkerRequestURL(bounds) {
    const markerRequestBounds = getValidMarkerRequestBounds(bounds);

    if (!markerRequestBounds) {
        return null;
    }

    return buildApiURL('markers', markerRequestBounds);
}

function addMarkerBreadcrumb({ bounds, message, reason }) {
    const span = getMarkerRequestBoundsSpan(bounds);

    addCrashlyticsLog({
        category: 'map.markers',
        data: {
            latitudeSpan: span ? Number(span.latitudeSpan.toFixed(3)) : null,
            longitudeSpan: span ? Number(span.longitudeSpan.toFixed(3)) : null,
            reason,
        },
        message,
    });
}

function createMarkerAbortError() {
    const error = new Error('Markers request cancelled');
    error.name = 'AbortError';
    return error;
}

function acquireMarkerRequest(bounds, requestBounds, requestURL) {
    let request = [...inFlightMarkerRequests].find(
        (candidate) =>
            candidate.revision === markerCacheRevision &&
            markerRequestBoundsContainCameraBounds(candidate.bounds, bounds),
    );

    if (!request) {
        const abortController = new AbortController();
        request = {
            bounds: requestBounds,
            revision: markerCacheRevision,
            consumers: 0,
            settled: false,
        };
        const responseData = (async () => {
            const response = await fetch(requestURL, {
                signal: abortController.signal,
            });
            if (!response.ok)
                throw new Error(
                    `Markers request failed with ${response.status}`,
                );
            return response.json();
        })();
        const cancellation = new Promise((_, reject) => {
            request.cancel = () => {
                clearTimeout(request.timeout);
                reject(createMarkerAbortError());
                abortController.abort();
            };
            request.timeout = setTimeout(() => {
                reject(new Error('Markers request timed out'));
                abortController.abort();
            }, 15000);
        });
        request.promise = Promise.race([responseData, cancellation])
            .then((data) => {
                if (
                    abortController.signal.aborted ||
                    request.revision !== markerCacheRevision
                )
                    throw createMarkerAbortError();
                const points = data?.points?.data ?? data?.points;
                if (!Array.isArray(points))
                    throw new Error('Invalid marker response');
                const entry = {
                    bounds: request.bounds,
                    points,
                    loadedAt: Date.now(),
                };
                markerCache.put(entry);
                return entry;
            })
            .finally(() => {
                request.settled = true;
                clearTimeout(request.timeout);
                inFlightMarkerRequests.delete(request);
            });
        inFlightMarkerRequests.add(request);
    }

    request.consumers++;
    let released = false;
    return {
        bounds: request.bounds,
        revision: request.revision,
        promise: request.promise,
        release() {
            if (released) return;
            released = true;
            request.consumers--;
            if (!request.settled && request.consumers === 0) {
                inFlightMarkerRequests.delete(request);
                request.cancel();
            }
        },
    };
}

export function createMarkerLoader() {
    const listeners = new Set();
    let snapshot;
    let state = {
        markerLoadError: '',
        markerPoints: [],
        markerCoverage: null,
        markersAreLoading: false,
        markerLoadingIndicatorIsVisible: false,
        renderMarkerLoadingIndicator: false,
    };
    const updateState = (key, value) => {
        const nextValue =
            typeof value === 'function' ? value(state[key]) : value;
        if (Object.is(state[key], nextValue)) return;
        state = { ...state, [key]: nextValue };
        snapshot = null;
        listeners.forEach((listener) => listener());
    };
    const setMarkerLoadError = (value) => updateState('markerLoadError', value);
    const setMarkerPoints = (value) => updateState('markerPoints', value);
    const setMarkerCoverage = (value) => updateState('markerCoverage', value);
    const setMarkerLoadingIndicatorIsVisible = (value) =>
        updateState('markerLoadingIndicatorIsVisible', value);
    const setRenderMarkerLoadingIndicator = (value) =>
        updateState('renderMarkerLoadingIndicator', value);
    const setMarkersAreLoading = (value) => {
        updateState('markersAreLoading', value);
        if (markerLoadingHideTimeoutRef.current) {
            clearTimeout(markerLoadingHideTimeoutRef.current);
            markerLoadingHideTimeoutRef.current = null;
        }
        if (value || !state.renderMarkerLoadingIndicator) return;
        const remaining = Math.max(
            MARKER_LOADING_MIN_VISIBLE_MS -
                (Date.now() - markerLoadingShownAtRef.current),
            0,
        );
        markerLoadingHideTimeoutRef.current = setTimeout(() => {
            markerLoadingHideTimeoutRef.current = null;
            markerLoadingIndicatorVisibleRef.current = false;
            setMarkerLoadingIndicatorIsVisible(false);
        }, remaining);
    };
    const activeMarkerBoundsKeyRef = { current: '' };
    const activeMarkerRequestBoundsRef = { current: null };
    const markerAbortControllerRef = { current: null };
    const markerLoadDebounceRef = { current: null };
    const markerLoadingHideTimeoutRef = { current: null };
    const markerLoadingIndicatorVisibleRef = { current: false };
    const markerLoadingShownAtRef = { current: 0 };
    const markerRequestIdRef = { current: 0 };
    const isProviderMountedRef = { current: false };
    const lastLoadedMarkerBoundsKeyRef = { current: '' };
    const lastLoadedMarkerRequestBoundsRef = { current: null };
    const pendingMarkerLoadRequestBoundsRef = { current: null };

    let retryTimeout = null;
    let queuedMarkerLoad = null;
    const coverageIsFresh = () =>
        state.markerCoverage &&
        Date.now() - state.markerCoverage.loadedAt < MARKER_CACHE_FRESH_MS;
    const clearActiveMarkerRequest = () => {
        activeMarkerBoundsKeyRef.current = '';
        activeMarkerRequestBoundsRef.current = null;
        markerAbortControllerRef.current = null;
    };

    const abortActiveMarkerRequest = () => {
        const hasActiveRequest = Boolean(
            markerAbortControllerRef.current ||
            activeMarkerRequestBoundsRef.current,
        );

        if (!hasActiveRequest) {
            return false;
        }

        markerAbortControllerRef.current?.abort();
        markerRequestIdRef.current += 1;
        clearActiveMarkerRequest();

        return true;
    };

    const abortMarkerRequest = () => {
        clearTimeout(retryTimeout);
        retryTimeout = null;
        if (markerLoadDebounceRef.current) {
            clearTimeout(markerLoadDebounceRef.current);
            markerLoadDebounceRef.current = null;
        }
        abortActiveMarkerRequest();
        pendingMarkerLoadRequestBoundsRef.current = null;
        queuedMarkerLoad = null;
    };

    const upsertMarkerPoints = (incomingMarkerPoints) => {
        if (
            !Array.isArray(incomingMarkerPoints) ||
            incomingMarkerPoints.length === 0
        ) {
            return;
        }

        abortMarkerRequest();
        setMarkersAreLoading(false);
        markerCacheRevision++;
        markerCache.clear();
        lastLoadedMarkerBoundsKeyRef.current = '';
        lastLoadedMarkerRequestBoundsRef.current = null;
        setMarkerCoverage(null);
        setMarkerPoints((currentMarkerPoints) =>
            upsertMarkerPointList(currentMarkerPoints, incomingMarkerPoints),
        );
    };

    const activeMarkerRequestContainsBounds = (bounds, boundsKey) => {
        return (
            (boundsKey && boundsKey === activeMarkerBoundsKeyRef.current) ||
            markerRequestBoundsContainCameraBounds(
                activeMarkerRequestBoundsRef.current,
                bounds,
            )
        );
    };

    const handleMarkerLoadingIndicatorHidden = () => {
        if (
            state.markersAreLoading ||
            markerLoadingIndicatorVisibleRef.current
        ) {
            return;
        }

        markerLoadingShownAtRef.current = 0;
        setRenderMarkerLoadingIndicator(false);
    };

    const loadMarkersForBounds = async (
        bounds,
        providedRequestBounds = null,
        retriesRemaining = 1,
    ) => {
        const requestBounds =
            providedRequestBounds ?? expandBoundsForMarkerRequest(bounds);

        if (!requestBounds) {
            return;
        }

        if (!markerRequestBoundsAreLoadable(requestBounds)) {
            addMarkerBreadcrumb({
                bounds: requestBounds,
                message: 'Marker load skipped',
                reason: 'bounds_too_large',
            });
            return;
        }

        const boundsKey = getMarkerBoundsKey(requestBounds);
        const activeRequestContainsBounds = activeMarkerRequestContainsBounds(
            bounds,
            boundsKey,
        );

        if (
            (coverageIsFresh() &&
                boundsKey === lastLoadedMarkerBoundsKeyRef.current) ||
            shouldSkipMarkerLoadRequest({
                activeRequestContainsBounds,
                cameraBounds: bounds,
                lastLoadedRequestBounds: coverageIsFresh()
                    ? lastLoadedMarkerRequestBoundsRef.current
                    : null,
                pendingRequestBounds: null,
            })
        ) {
            return;
        }

        abortActiveMarkerRequest();

        const requestId = markerRequestIdRef.current + 1;
        const abortController = new AbortController();
        const requestURL = buildMarkerRequestURL(requestBounds);

        if (!requestURL) {
            addMarkerBreadcrumb({
                bounds: requestBounds,
                message: 'Marker load skipped',
                reason: 'invalid_bounds',
            });
            return;
        }

        markerRequestIdRef.current = requestId;
        activeMarkerBoundsKeyRef.current = boundsKey;
        activeMarkerRequestBoundsRef.current = requestBounds;
        markerAbortControllerRef.current = abortController;
        if (markerLoadingHideTimeoutRef.current) {
            clearTimeout(markerLoadingHideTimeoutRef.current);
            markerLoadingHideTimeoutRef.current = null;
        }
        markerLoadingShownAtRef.current = Date.now();
        markerLoadingIndicatorVisibleRef.current = true;
        setRenderMarkerLoadingIndicator(true);
        setMarkerLoadingIndicatorIsVisible(true);
        setMarkersAreLoading(true);
        setMarkerLoadError('');

        try {
            if (!mapApiMocksAreEnabled()) {
                await markerCache.hydrate();
                if (
                    !isProviderMountedRef.current ||
                    markerRequestIdRef.current !== requestId ||
                    queuedMarkerLoad
                )
                    return;
                const cached = markerCache.find(bounds);
                if (cached) {
                    setMarkerPoints(cached.points);
                    setMarkerCoverage({
                        bounds: cached.bounds,
                        loadedAt: cached.loadedAt,
                    });
                    lastLoadedMarkerBoundsKeyRef.current = getMarkerBoundsKey(
                        cached.bounds,
                    );
                    lastLoadedMarkerRequestBoundsRef.current = cached.bounds;
                    if (coverageIsFresh()) return;
                }
            }
            if (mapApiMocksAreEnabled()) {
                const nextMarkerPoints = await getMockMarkerPoints({
                    signal: abortController.signal,
                });

                if (
                    isProviderMountedRef.current &&
                    markerRequestIdRef.current === requestId &&
                    !queuedMarkerLoad
                ) {
                    setMarkerPoints(nextMarkerPoints);
                    setMarkerCoverage({
                        bounds: requestBounds,
                        loadedAt: Date.now(),
                    });
                    lastLoadedMarkerBoundsKeyRef.current = boundsKey;
                    lastLoadedMarkerRequestBoundsRef.current = requestBounds;
                }

                return;
            }

            const markerRequest = acquireMarkerRequest(
                bounds,
                requestBounds,
                requestURL,
            );
            activeMarkerRequestBoundsRef.current = markerRequest.bounds;
            activeMarkerBoundsKeyRef.current = getMarkerBoundsKey(
                markerRequest.bounds,
            );
            abortController.signal.addEventListener(
                'abort',
                markerRequest.release,
                { once: true },
            );
            let entry;
            try {
                entry = await markerRequest.promise;
            } finally {
                abortController.signal.removeEventListener(
                    'abort',
                    markerRequest.release,
                );
                markerRequest.release();
            }

            addMarkerBreadcrumb({
                bounds: entry.bounds,
                message: 'Marker load completed',
                reason: `count:${entry.points.length}`,
            });

            if (
                isProviderMountedRef.current &&
                markerRequestIdRef.current === requestId &&
                markerRequest.revision === markerCacheRevision &&
                !queuedMarkerLoad
            ) {
                setMarkerPoints(entry.points);
                setMarkerCoverage({
                    bounds: entry.bounds,
                    loadedAt: entry.loadedAt,
                });
                lastLoadedMarkerBoundsKeyRef.current = getMarkerBoundsKey(
                    entry.bounds,
                );
                lastLoadedMarkerRequestBoundsRef.current = entry.bounds;
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }

            if (
                isProviderMountedRef.current &&
                markerRequestIdRef.current === requestId
            ) {
                setMarkerLoadError('Markers could not be loaded.');
                addMarkerBreadcrumb({
                    bounds: requestBounds,
                    message: 'Marker load failed',
                    reason: error?.message ?? 'unknown',
                });
                retryTimeout = setTimeout(() => {
                    retryTimeout = null;
                    const queued = queuedMarkerLoad;
                    queuedMarkerLoad = null;
                    pendingMarkerLoadRequestBoundsRef.current = null;
                    if (
                        retriesRemaining > 0 &&
                        isProviderMountedRef.current &&
                        markerRequestIdRef.current === requestId
                    ) {
                        loadMarkersForBounds(
                            queued?.bounds ?? bounds,
                            queued?.requestBounds ?? requestBounds,
                            retriesRemaining - 1,
                        );
                    }
                }, 15000);
            }
        } finally {
            if (
                isProviderMountedRef.current &&
                markerRequestIdRef.current === requestId
            ) {
                clearActiveMarkerRequest();
                const queued = queuedMarkerLoad;
                if (queued && !retryTimeout) {
                    queuedMarkerLoad = null;
                    pendingMarkerLoadRequestBoundsRef.current = null;
                    loadMarkersForBounds(queued.bounds, queued.requestBounds);
                } else {
                    setMarkersAreLoading(false);
                }
            }
        }
    };

    const scheduleMarkerLoad = (bounds, delay = MARKER_LOAD_DEBOUNCE_MS) => {
        if (!bounds) {
            return;
        }

        // Returning to cached coverage must also cancel a pending load for the
        // area we just left, or its response will replace the visible markers.
        if (
            coverageIsFresh() &&
            markerRequestBoundsContainCameraBounds(
                lastLoadedMarkerRequestBoundsRef.current,
                bounds,
            )
        ) {
            if (
                retryTimeout ||
                markerLoadDebounceRef.current ||
                markerAbortControllerRef.current
            ) {
                abortMarkerRequest();
                setMarkersAreLoading(false);
            }
            setMarkerLoadError('');
            return;
        }

        const requestBounds = expandBoundsForMarkerRequest(bounds);

        if (!requestBounds) {
            return;
        }

        if (!markerRequestBoundsAreLoadable(requestBounds)) {
            addMarkerBreadcrumb({
                bounds: requestBounds,
                message: 'Marker load skipped',
                reason: 'bounds_too_large',
            });
            return;
        }

        const boundsKey = getMarkerBoundsKey(requestBounds);
        const activeRequestContainsBounds = activeMarkerRequestContainsBounds(
            bounds,
            boundsKey,
        );

        if (activeRequestContainsBounds) {
            queuedMarkerLoad = null;
            pendingMarkerLoadRequestBoundsRef.current = null;
            return;
        }

        if (markerAbortControllerRef.current || retryTimeout) {
            queuedMarkerLoad = { bounds, requestBounds };
            pendingMarkerLoadRequestBoundsRef.current = requestBounds;
            return;
        }

        if (
            shouldSkipMarkerLoadRequest({
                activeRequestContainsBounds,
                cameraBounds: bounds,
                lastLoadedRequestBounds: coverageIsFresh()
                    ? lastLoadedMarkerRequestBoundsRef.current
                    : null,
                pendingRequestBounds: pendingMarkerLoadRequestBoundsRef.current,
            })
        ) {
            return;
        }

        if (markerLoadDebounceRef.current) {
            clearTimeout(markerLoadDebounceRef.current);
            pendingMarkerLoadRequestBoundsRef.current = null;
        }

        pendingMarkerLoadRequestBoundsRef.current = requestBounds;

        markerLoadDebounceRef.current = setTimeout(() => {
            markerLoadDebounceRef.current = null;
            pendingMarkerLoadRequestBoundsRef.current = null;
            loadMarkersForBounds(bounds, requestBounds);
        }, delay);
    };

    const getSnapshot = () => {
        snapshot ??= {
            ...state,
            handleMarkerLoadingIndicatorHidden,
            scheduleMarkerLoad,
            upsertMarkerPoints,
        };
        return snapshot;
    };
    const subscribe = (listener) => {
        listeners.add(listener);
        isProviderMountedRef.current = true;
        return () => {
            listeners.delete(listener);
            if (listeners.size > 0) return;
            isProviderMountedRef.current = false;
            if (markerLoadDebounceRef.current) {
                clearTimeout(markerLoadDebounceRef.current);
                markerLoadDebounceRef.current = null;
            }
            if (markerLoadingHideTimeoutRef.current) {
                clearTimeout(markerLoadingHideTimeoutRef.current);
                markerLoadingHideTimeoutRef.current = null;
            }
            abortMarkerRequest();
            lastLoadedMarkerBoundsKeyRef.current = '';
            lastLoadedMarkerRequestBoundsRef.current = null;
            setMarkerCoverage(null);
            markerLoadingIndicatorVisibleRef.current = false;
            markerLoadingShownAtRef.current = 0;
            updateState('markersAreLoading', false);
            setMarkerLoadingIndicatorIsVisible(false);
            setRenderMarkerLoadingIndicator(false);
        };
    };
    return { getSnapshot, subscribe };
}

// Car surfaces are separate React roots. A module store lets them share the
// request lifecycle and exact marker inventory without a common provider.
const autoPlayMarkerLoader = createMarkerLoader();

export function useMarkerLoader({ shared = false } = {}) {
    const localLoaderRef = useRef(null);
    if (!shared && !localLoaderRef.current) {
        localLoaderRef.current = createMarkerLoader();
    }
    const loader = shared ? autoPlayMarkerLoader : localLoaderRef.current;
    return useSyncExternalStore(
        loader.subscribe,
        loader.getSnapshot,
        loader.getSnapshot,
    );
}
