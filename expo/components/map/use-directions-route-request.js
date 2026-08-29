import { useCallback, useRef } from 'react';
import { Keyboard } from 'react-native';
import { normalizeAdvancedRouteSettings } from './advanced-route-settings';
import {
    logMapDirectionsRequested,
    logMapDirectionsRouteLoaded,
} from './analytics';
import { getDirections } from './api';
import {
    getDirectionsRouteBounds,
    getDirectionsWaypointApiCoord,
    selectDirectionsRoute,
} from './directions';

export function useDirectionsRouteRequest({
    advancedRouteSettings,
    directionsDebugGeometryIsEnabled = false,
    isMountedRef,
    setDirectionsRoute,
    setDirectionsRouteError,
    setDirectionsRouteIsLoading,
    setDirectionsSearchIsFocused,
}) {
    const directionsAbortControllerRef = useRef(null);

    const clearDirectionsRouteRequest = useCallback(() => {
        if (directionsAbortControllerRef.current) {
            directionsAbortControllerRef.current.abort();
            directionsAbortControllerRef.current = null;
        }
    }, []);

    const requestDirectionsRoute = useCallback(
        ({
            advancedRouteSettings: requestedAdvancedRouteSettings,
            destinationWaypoint,
            selectedRouteKey,
            source = 'directions_form',
            startWaypoint,
            stopWaypoints = [],
        }) => {
            const normalizedAdvancedRouteSettings =
                normalizeAdvancedRouteSettings(
                    requestedAdvancedRouteSettings ?? advancedRouteSettings,
                );
            const startApiCoord = getDirectionsWaypointApiCoord(startWaypoint);
            const destinationApiCoord =
                getDirectionsWaypointApiCoord(destinationWaypoint);
            const waypointApiCoords = stopWaypoints
                .map((waypoint) => getDirectionsWaypointApiCoord(waypoint))
                .filter(Boolean);

            if (!startApiCoord || !destinationApiCoord) {
                setDirectionsRouteError('Choose both a start and destination.');
                return false;
            }

            clearDirectionsRouteRequest();

            const abortController = new AbortController();

            directionsAbortControllerRef.current = abortController;
            setDirectionsRouteError('');
            setDirectionsRouteIsLoading(true);
            setDirectionsSearchIsFocused(false);
            Keyboard.dismiss();
            logMapDirectionsRequested({
                destinationWaypoint,
                source,
                startWaypoint,
                stopWaypoints,
            });

            getDirections({
                advancedRouteSettings: normalizedAdvancedRouteSettings,
                end: destinationApiCoord,
                showZone: directionsDebugGeometryIsEnabled,
                signal: abortController.signal,
                start: startApiCoord,
                waypoints: waypointApiCoords,
            })
                .then(({ debugGeometry, exclusionZone, route }) => {
                    if (
                        !isMountedRef.current ||
                        directionsAbortControllerRef.current !== abortController
                    ) {
                        return;
                    }

                    const routeWithPreservedSelection = selectDirectionsRoute(
                        route,
                        selectedRouteKey,
                    );
                    const bounds = getDirectionsRouteBounds(
                        routeWithPreservedSelection,
                    );
                    const nextRoute = {
                        ...routeWithPreservedSelection,
                        advancedRouteSettings: normalizedAdvancedRouteSettings,
                        bounds,
                        debugGeometry,
                        destination: destinationWaypoint,
                        exclusionZone,
                        requestedAt: Date.now(),
                        start: startWaypoint,
                        stopWaypoints,
                    };

                    setDirectionsRoute(nextRoute);
                    logMapDirectionsRouteLoaded({ route: nextRoute });
                })
                .catch((error) => {
                    if (error?.name === 'AbortError') {
                        return;
                    }

                    if (
                        isMountedRef.current &&
                        directionsAbortControllerRef.current === abortController
                    ) {
                        setDirectionsRouteError(
                            error?.message || 'Directions could not be loaded.',
                        );
                    }
                })
                .finally(() => {
                    if (
                        directionsAbortControllerRef.current !== abortController
                    ) {
                        return;
                    }

                    directionsAbortControllerRef.current = null;

                    if (isMountedRef.current) {
                        setDirectionsRouteIsLoading(false);
                    }
                });

            return true;
        },
        [
            clearDirectionsRouteRequest,
            advancedRouteSettings,
            directionsDebugGeometryIsEnabled,
            isMountedRef,
            setDirectionsRoute,
            setDirectionsRouteError,
            setDirectionsRouteIsLoading,
            setDirectionsSearchIsFocused,
        ],
    );

    return {
        clearDirectionsRouteRequest,
        requestDirectionsRoute,
    };
}
