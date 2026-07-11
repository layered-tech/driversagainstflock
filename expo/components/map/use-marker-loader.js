import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiURL } from './config';
import { addSentryBreadcrumb } from '../../lib/sentry';
import { getMockMarkerPoints, mapApiMocksAreEnabled } from './api-mocks';
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
} from './geo';

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

    addSentryBreadcrumb({
        category: 'map.markers',
        data: {
            latitudeSpan: span ? Number(span.latitudeSpan.toFixed(3)) : null,
            longitudeSpan: span ? Number(span.longitudeSpan.toFixed(3)) : null,
            reason,
        },
        message,
    });
}

export function useMarkerLoader() {
    const activeMarkerBoundsKeyRef = useRef('');
    const activeMarkerRequestBoundsRef = useRef(null);
    const markerAbortControllerRef = useRef(null);
    const markerLoadDebounceRef = useRef(null);
    const markerLoadingHideTimeoutRef = useRef(null);
    const markerLoadingIndicatorVisibleRef = useRef(false);
    const markerLoadingShownAtRef = useRef(0);
    const markerRequestIdRef = useRef(0);
    const isProviderMountedRef = useRef(false);
    const lastLoadedMarkerBoundsKeyRef = useRef('');
    const lastLoadedMarkerRequestBoundsRef = useRef(null);
    const pendingMarkerLoadRequestBoundsRef = useRef(null);
    const [markerLoadError, setMarkerLoadError] = useState('');
    const [markerPoints, setMarkerPoints] = useState([]);
    const [markersAreLoading, setMarkersAreLoading] = useState(false);
    const [
        markerLoadingIndicatorIsVisible,
        setMarkerLoadingIndicatorIsVisible,
    ] = useState(false);
    const [renderMarkerLoadingIndicator, setRenderMarkerLoadingIndicator] =
        useState(false);

    const clearActiveMarkerRequest = useCallback(() => {
        activeMarkerBoundsKeyRef.current = '';
        activeMarkerRequestBoundsRef.current = null;
        markerAbortControllerRef.current = null;
    }, []);

    const abortActiveMarkerRequest = useCallback(() => {
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
    }, [clearActiveMarkerRequest]);

    const abortMarkerRequest = useCallback(() => {
        abortActiveMarkerRequest();
        pendingMarkerLoadRequestBoundsRef.current = null;
    }, [abortActiveMarkerRequest]);

    const activeMarkerRequestContainsBounds = useCallback(
        (bounds, boundsKey) => {
            return (
                (boundsKey && boundsKey === activeMarkerBoundsKeyRef.current) ||
                markerRequestBoundsContainCameraBounds(
                    activeMarkerRequestBoundsRef.current,
                    bounds,
                )
            );
        },
        [],
    );

    const handleMarkerLoadingIndicatorHidden = useCallback(() => {
        if (markersAreLoading || markerLoadingIndicatorVisibleRef.current) {
            return;
        }

        markerLoadingShownAtRef.current = 0;
        setRenderMarkerLoadingIndicator(false);
    }, [markersAreLoading]);

    useEffect(() => {
        if (markerLoadingHideTimeoutRef.current) {
            clearTimeout(markerLoadingHideTimeoutRef.current);
            markerLoadingHideTimeoutRef.current = null;
        }

        if (markersAreLoading) {
            markerLoadingIndicatorVisibleRef.current = true;

            if (!markerLoadingShownAtRef.current) {
                markerLoadingShownAtRef.current = Date.now();
            }

            setRenderMarkerLoadingIndicator(true);
            setMarkerLoadingIndicatorIsVisible(true);

            return undefined;
        }

        if (!renderMarkerLoadingIndicator) {
            return undefined;
        }

        const elapsedVisibleTime = Date.now() - markerLoadingShownAtRef.current;
        const remainingVisibleTime = Math.max(
            MARKER_LOADING_MIN_VISIBLE_MS - elapsedVisibleTime,
            0,
        );

        markerLoadingHideTimeoutRef.current = setTimeout(() => {
            markerLoadingHideTimeoutRef.current = null;
            markerLoadingIndicatorVisibleRef.current = false;
            setMarkerLoadingIndicatorIsVisible(false);
        }, remainingVisibleTime);

        return () => {
            if (markerLoadingHideTimeoutRef.current) {
                clearTimeout(markerLoadingHideTimeoutRef.current);
                markerLoadingHideTimeoutRef.current = null;
            }
        };
    }, [markersAreLoading, renderMarkerLoadingIndicator]);

    const loadMarkersForBounds = useCallback(
        async (bounds, providedRequestBounds = null) => {
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
            const activeRequestContainsBounds =
                activeMarkerRequestContainsBounds(bounds, boundsKey);
            const abortedActiveRequest = activeRequestContainsBounds
                ? false
                : abortActiveMarkerRequest();

            if (
                boundsKey === lastLoadedMarkerBoundsKeyRef.current ||
                markerRequestBoundsContainCameraBounds(
                    lastLoadedMarkerRequestBoundsRef.current,
                    bounds,
                ) ||
                activeRequestContainsBounds
            ) {
                if (abortedActiveRequest) {
                    setMarkersAreLoading(false);
                }

                return;
            }

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
                if (mapApiMocksAreEnabled()) {
                    const nextMarkerPoints = await getMockMarkerPoints({
                        signal: abortController.signal,
                    });

                    if (
                        isProviderMountedRef.current &&
                        markerRequestIdRef.current === requestId
                    ) {
                        setMarkerPoints(nextMarkerPoints);
                        lastLoadedMarkerBoundsKeyRef.current = boundsKey;
                        lastLoadedMarkerRequestBoundsRef.current =
                            requestBounds;
                    }

                    return;
                }

                const response = await fetch(requestURL, {
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    throw new Error(
                        `Markers request failed with ${response.status}`,
                    );
                }

                const data = await response.json();
                const pointsData = data?.points?.data ?? data?.points ?? [];
                const nextMarkerPoints = Array.isArray(pointsData)
                    ? pointsData
                    : [];

                addMarkerBreadcrumb({
                    bounds: requestBounds,
                    message: 'Marker load completed',
                    reason: `count:${nextMarkerPoints.length}`,
                });

                if (
                    isProviderMountedRef.current &&
                    markerRequestIdRef.current === requestId
                ) {
                    setMarkerPoints(nextMarkerPoints);
                    lastLoadedMarkerBoundsKeyRef.current = boundsKey;
                    lastLoadedMarkerRequestBoundsRef.current = requestBounds;
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
                }
            } finally {
                if (
                    isProviderMountedRef.current &&
                    markerRequestIdRef.current === requestId
                ) {
                    clearActiveMarkerRequest();
                    setMarkersAreLoading(false);
                }
            }
        },
        [
            abortActiveMarkerRequest,
            activeMarkerRequestContainsBounds,
            clearActiveMarkerRequest,
        ],
    );

    const scheduleMarkerLoad = useCallback(
        (bounds, delay = MARKER_LOAD_DEBOUNCE_MS) => {
            if (!bounds) {
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
            const activeRequestContainsBounds =
                activeMarkerRequestContainsBounds(bounds, boundsKey);
            const abortedActiveRequest = activeRequestContainsBounds
                ? false
                : abortActiveMarkerRequest();

            if (
                markerRequestBoundsContainCameraBounds(
                    lastLoadedMarkerRequestBoundsRef.current,
                    bounds,
                ) ||
                activeRequestContainsBounds ||
                markerRequestBoundsContainCameraBounds(
                    pendingMarkerLoadRequestBoundsRef.current,
                    bounds,
                )
            ) {
                if (
                    abortedActiveRequest &&
                    !pendingMarkerLoadRequestBoundsRef.current
                ) {
                    setMarkersAreLoading(false);
                }

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
        },
        [
            abortActiveMarkerRequest,
            activeMarkerRequestContainsBounds,
            loadMarkersForBounds,
        ],
    );

    useEffect(() => {
        isProviderMountedRef.current = true;

        return () => {
            isProviderMountedRef.current = false;

            if (markerLoadDebounceRef.current) {
                clearTimeout(markerLoadDebounceRef.current);
                pendingMarkerLoadRequestBoundsRef.current = null;
            }

            if (markerLoadingHideTimeoutRef.current) {
                clearTimeout(markerLoadingHideTimeoutRef.current);
            }

            abortMarkerRequest();
        };
    }, [abortMarkerRequest]);

    return {
        handleMarkerLoadingIndicatorHidden,
        markerLoadError,
        markerLoadingIndicatorIsVisible,
        markerPoints,
        renderMarkerLoadingIndicator,
        scheduleMarkerLoad,
    };
}
