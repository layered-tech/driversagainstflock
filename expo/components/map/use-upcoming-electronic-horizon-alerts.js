import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSelectedDirectionsRouteOption } from './directions';
import {
    getDirectionsRouteCoordinatesAhead,
    getElectronicHorizonPrimaryCoordinates,
    getUpcomingElectronicHorizonAlerts,
} from './electronic-horizon';
import {
    addElectronicHorizonAlprNodesListener,
    EMPTY_ELECTRONIC_HORIZON_ALPR_NODES,
    getElectronicHorizonAlprCoordinatePathStateKey,
    getElectronicHorizonAlprDirectionsRoutePathKey,
    getElectronicHorizonAlprPathStateKey,
    getSharedElectronicHorizonAlprNodes,
    hydrateElectronicHorizonAlprNodes,
    refreshElectronicHorizonAlprNodesIfStale,
} from './electronic-horizon-alpr-store';
import { shouldRefreshLocationData } from './location-watch-options';
import { recordMapPerformanceSignpost } from './map-performance-signposts';
import { usePersistentRoadMatchingWatchIsActive } from './use-device-location';

const ELECTRONIC_HORIZON_ALPR_STALE_CHECK_INTERVAL_MS = 15 * 1000;

function getElectronicHorizonAlertPathState({
    electronicHorizon,
    routeOption,
    userLocation,
}) {
    const activeRouteCoordinates = getDirectionsRouteCoordinatesAhead(
        routeOption?.coordinates,
        userLocation,
    );
    const pathSource =
        activeRouteCoordinates.length >= 2 ? 'route' : 'electronic-horizon';
    const electronicHorizonCoordinates =
        pathSource === 'electronic-horizon'
            ? getElectronicHorizonPrimaryCoordinates(electronicHorizon)
            : [];
    const coordinates =
        pathSource === 'route'
            ? activeRouteCoordinates
            : electronicHorizonCoordinates;

    return {
        coordinates,
        pathSource,
        pathStateKey: getElectronicHorizonAlprPathStateKey({
            coordinates,
            electronicHorizon:
                pathSource === 'electronic-horizon' ? electronicHorizon : null,
            pathSource,
            routePathKey:
                getElectronicHorizonAlprDirectionsRoutePathKey(routeOption),
        }),
    };
}

export function useUpcomingElectronicHorizonAlerts({
    directionsRoute,
    electronicHorizon,
    enabled = true,
    policeAlerts,
    userLocation,
} = {}) {
    const selectedDirectionsRouteOption =
        getSelectedDirectionsRouteOption(directionsRoute);
    const { coordinates, pathSource, pathStateKey } =
        getElectronicHorizonAlertPathState({
            electronicHorizon,
            routeOption: selectedDirectionsRouteOption,
            userLocation,
        });
    const coordinatePathStateKey =
        getElectronicHorizonAlprCoordinatePathStateKey(coordinates);
    const alertPathStateRef = useRef({ coordinates, pathStateKey });
    const persistentRoadMatchingWatchIsActive =
        usePersistentRoadMatchingWatchIsActive();
    const [alprNodes, setAlprNodes] = useState(
        enabled
            ? getSharedElectronicHorizonAlprNodes()
            : EMPTY_ELECTRONIC_HORIZON_ALPR_NODES,
    );

    alertPathStateRef.current = { coordinates, pathStateKey };

    const refreshAlprNodesIfStale = useCallback(() => {
        if (
            !shouldRefreshLocationData({
                appState: AppState.currentState,
                persistentRoadMatchingWatchIsActive,
            })
        ) {
            return;
        }

        const currentPathState = alertPathStateRef.current;

        if (!enabled || currentPathState.coordinates.length < 2) {
            return;
        }

        return refreshElectronicHorizonAlprNodesIfStale({
            coordinates: currentPathState.coordinates,
            primaryPathKey: currentPathState.pathStateKey,
        });
    }, [enabled, persistentRoadMatchingWatchIsActive]);

    useEffect(() => {
        if (enabled) {
            refreshAlprNodesIfStale();
        }
    }, [
        coordinatePathStateKey,
        enabled,
        pathStateKey,
        refreshAlprNodesIfStale,
    ]);

    useEffect(() => {
        if (!enabled) {
            setAlprNodes(EMPTY_ELECTRONIC_HORIZON_ALPR_NODES);

            return undefined;
        }

        setAlprNodes(getSharedElectronicHorizonAlprNodes());
        const alprNodesSubscription =
            addElectronicHorizonAlprNodesListener(setAlprNodes);

        void hydrateElectronicHorizonAlprNodes();

        const intervalId = setInterval(
            refreshAlprNodesIfStale,
            ELECTRONIC_HORIZON_ALPR_STALE_CHECK_INTERVAL_MS,
        );
        const appStateSubscription = AppState.addEventListener(
            'change',
            (appState) => {
                if (appState === 'active') {
                    refreshAlprNodesIfStale();
                }
            },
        );

        refreshAlprNodesIfStale();

        return () => {
            alprNodesSubscription.remove();
            clearInterval(intervalId);
            appStateSubscription.remove();
        };
    }, [enabled, refreshAlprNodesIfStale]);

    const upcomingAlertComputation = useMemo(() => {
        const startedAt = Date.now();
        const upcomingAlerts = getUpcomingElectronicHorizonAlerts({
            alprNodes,
            electronicHorizon,
            pathCoordinates: coordinates,
            policeAlerts,
        });

        return {
            durationMs: Math.max(0, Date.now() - startedAt),
            upcomingAlerts,
        };
    }, [alprNodes, coordinates, electronicHorizon, policeAlerts]);

    useEffect(() => {
        recordMapPerformanceSignpost('alerts.compute.completed', {
            alprNodeCount: alprNodes.length,
            durationMs: upcomingAlertComputation.durationMs,
            pathSource,
            upcomingAlertCount: upcomingAlertComputation.upcomingAlerts.length,
        });
    }, [alprNodes.length, pathSource, upcomingAlertComputation]);

    return {
        alprNodes,
        upcomingAlerts: upcomingAlertComputation.upcomingAlerts,
    };
}
