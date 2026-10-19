import { useRef, useSyncExternalStore } from 'react';
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
        if (markerLoadDebounceRef.current) {
            clearTimeout(markerLoadDebounceRef.current);
            markerLoadDebounceRef.current = null;
        }
        abortActiveMarkerRequest();
        pendingMarkerLoadRequestBoundsRef.current = null;
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
            boundsKey === lastLoadedMarkerBoundsKeyRef.current ||
            shouldSkipMarkerLoadRequest({
                activeRequestContainsBounds,
                cameraBounds: bounds,
                lastLoadedRequestBounds:
                    lastLoadedMarkerRequestBoundsRef.current,
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
            if (mapApiMocksAreEnabled()) {
                const nextMarkerPoints = await getMockMarkerPoints({
                    signal: abortController.signal,
                });

                if (
                    isProviderMountedRef.current &&
                    markerRequestIdRef.current === requestId
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
                setMarkerCoverage({
                    bounds: requestBounds,
                    loadedAt: Date.now(),
                });
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
    };

    const scheduleMarkerLoad = (bounds, delay = MARKER_LOAD_DEBOUNCE_MS) => {
        if (!bounds) {
            return;
        }

        // Returning to cached coverage must also cancel a pending load for the
        // area we just left, or its response will replace the visible markers.
        if (
            markerRequestBoundsContainCameraBounds(
                lastLoadedMarkerRequestBoundsRef.current,
                bounds,
            )
        ) {
            if (
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

        if (
            shouldSkipMarkerLoadRequest({
                activeRequestContainsBounds,
                cameraBounds: bounds,
                lastLoadedRequestBounds:
                    lastLoadedMarkerRequestBoundsRef.current,
                pendingRequestBounds: pendingMarkerLoadRequestBoundsRef.current,
            })
        ) {
            return;
        }

        abortActiveMarkerRequest();

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
