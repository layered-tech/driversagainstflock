import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSelectedDirectionsRouteOption } from './directions';
import {
    getDirectionsRouteCoordinatesAhead,
    getElectronicHorizonPrimaryCoordinates,
    getUpcomingElectronicHorizonAlerts,
} from './electronic-horizon';
import { getElectronicHorizonAlprNodes } from './electronic-horizon-alerts-api';
import { getCoordinateDistanceMeters, getStoredNumber } from './geo';

const ELECTRONIC_HORIZON_ALPR_REFRESH_DISTANCE_METERS = 300;
const ELECTRONIC_HORIZON_ALPR_REFRESH_INTERVAL_MS = 30 * 1000;
const ELECTRONIC_HORIZON_ALPR_PATH_CHANGE_REFRESH_INTERVAL_MS = 10 * 1000;
const ELECTRONIC_HORIZON_ALPR_STALE_CHECK_INTERVAL_MS = 15 * 1000;
const EMPTY_ALPR_NODES = Object.freeze([]);

const sharedElectronicHorizonAlprState = {
    fetchedAt: 0,
    fetchStartCoordinate: null,
    inFlightPromise: null,
    nodes: EMPTY_ALPR_NODES,
    primaryPathKey: null,
};
const electronicHorizonAlprListeners = new Set();

function notifyElectronicHorizonAlprListeners() {
    electronicHorizonAlprListeners.forEach((listener) =>
        listener(sharedElectronicHorizonAlprState.nodes),
    );
}

function electronicHorizonAlprNodesAreFresh(coordinates, primaryPathKey) {
    const startCoordinate = coordinates?.[0];

    if (
        !sharedElectronicHorizonAlprState.fetchedAt ||
        !sharedElectronicHorizonAlprState.fetchStartCoordinate ||
        !startCoordinate
    ) {
        return false;
    }

    const ageMs = Date.now() - sharedElectronicHorizonAlprState.fetchedAt;

    if (ageMs >= ELECTRONIC_HORIZON_ALPR_REFRESH_INTERVAL_MS) {
        return false;
    }

    if (
        sharedElectronicHorizonAlprState.primaryPathKey !== primaryPathKey &&
        (hasActiveRoutePath(sharedElectronicHorizonAlprState.primaryPathKey) ||
            hasActiveRoutePath(primaryPathKey) ||
            ageMs >= ELECTRONIC_HORIZON_ALPR_PATH_CHANGE_REFRESH_INTERVAL_MS)
    ) {
        return false;
    }

    const distanceMeters = getCoordinateDistanceMeters(
        sharedElectronicHorizonAlprState.fetchStartCoordinate,
        startCoordinate,
    );

    return (
        distanceMeters !== null &&
        distanceMeters < ELECTRONIC_HORIZON_ALPR_REFRESH_DISTANCE_METERS
    );
}

function hasActiveRoutePath(pathStateKey) {
    return (
        typeof pathStateKey === 'string' && pathStateKey.startsWith('route:')
    );
}

function refreshSharedElectronicHorizonAlprNodes(coordinates, primaryPathKey) {
    if (sharedElectronicHorizonAlprState.inFlightPromise) {
        return sharedElectronicHorizonAlprState.inFlightPromise;
    }

    sharedElectronicHorizonAlprState.inFlightPromise = (async () => {
        try {
            const nodes = await getElectronicHorizonAlprNodes({ coordinates });

            sharedElectronicHorizonAlprState.nodes = nodes.length
                ? nodes
                : EMPTY_ALPR_NODES;
            sharedElectronicHorizonAlprState.fetchStartCoordinate =
                coordinates[0] ?? null;
            sharedElectronicHorizonAlprState.fetchedAt = Date.now();
            sharedElectronicHorizonAlprState.primaryPathKey = primaryPathKey;
            notifyElectronicHorizonAlprListeners();
        } catch {
            // Existing, still-relevant nodes remain available until the next
            // horizon refresh succeeds.
        } finally {
            sharedElectronicHorizonAlprState.inFlightPromise = null;
        }
    })();

    return sharedElectronicHorizonAlprState.inFlightPromise;
}

function getPathStateKey({
    electronicHorizon,
    pathSource,
    routePathKey,
    coordinates,
}) {
    if (pathSource === 'route') {
        return `route:${routePathKey}`;
    }

    const primaryEdgeIds = electronicHorizon?.primaryPath?.segments
        ?.map((segment) => segment?.edgeId)
        .filter((edgeId) => edgeId !== null && edgeId !== undefined)
        .slice(0, 12);

    if (primaryEdgeIds?.length) {
        return `edges:${primaryEdgeIds.join('|')}`;
    }

    return `electronic-horizon:${getCoordinatePathStateKey(coordinates)}`;
}

function getDirectionsRoutePathKey(routeOption) {
    const routeCoordinates = routeOption?.coordinates;

    return [
        routeOption?.routeKey ?? '',
        routeCoordinates?.length ?? '',
        getCoordinatePathStateKey(routeCoordinates),
    ].join('|');
}

function getCoordinatePathStateKey(coordinates) {
    const startCoordinate = coordinates?.[0];
    const endCoordinate = coordinates?.[coordinates.length - 1];
    const middleCoordinate = coordinates?.[Math.floor(coordinates.length / 2)];

    return [startCoordinate, middleCoordinate, endCoordinate]
        .flatMap((coordinate) =>
            Array.isArray(coordinate)
                ? coordinate.map((value) => getStoredNumber(value)?.toFixed(3))
                : ['', ''],
        )
        .join('|');
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
    const activeRouteCoordinates = getDirectionsRouteCoordinatesAhead(
        selectedDirectionsRouteOption?.coordinates,
        userLocation,
    );
    const electronicHorizonCoordinates =
        getElectronicHorizonPrimaryCoordinates(electronicHorizon);
    const pathSource =
        activeRouteCoordinates.length >= 2 ? 'route' : 'electronic-horizon';
    const coordinates =
        pathSource === 'route'
            ? activeRouteCoordinates
            : electronicHorizonCoordinates;
    const pathStateKey = getPathStateKey({
        coordinates,
        electronicHorizon,
        pathSource,
        routePathKey: getDirectionsRoutePathKey(selectedDirectionsRouteOption),
    });
    const coordinatesRef = useRef(coordinates);
    const [alprNodes, setAlprNodes] = useState(
        enabled ? sharedElectronicHorizonAlprState.nodes : EMPTY_ALPR_NODES,
    );

    const refreshAlprNodesIfStale = useCallback(() => {
        if (AppState.currentState !== 'active') {
            return;
        }

        const currentCoordinates = coordinatesRef.current;

        if (
            !enabled ||
            currentCoordinates.length < 2 ||
            electronicHorizonAlprNodesAreFresh(currentCoordinates, pathStateKey)
        ) {
            return;
        }

        refreshSharedElectronicHorizonAlprNodes(
            currentCoordinates,
            pathStateKey,
        );
    }, [enabled, pathStateKey]);

    useEffect(() => {
        coordinatesRef.current = coordinates;

        if (enabled) {
            refreshAlprNodesIfStale();
        }
    }, [enabled, pathStateKey, refreshAlprNodesIfStale]);

    useEffect(() => {
        if (!enabled) {
            setAlprNodes(EMPTY_ALPR_NODES);

            return undefined;
        }

        setAlprNodes(sharedElectronicHorizonAlprState.nodes);
        electronicHorizonAlprListeners.add(setAlprNodes);

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
            electronicHorizonAlprListeners.delete(setAlprNodes);
            clearInterval(intervalId);
            appStateSubscription.remove();
        };
    }, [enabled, refreshAlprNodesIfStale]);

    const upcomingAlerts = useMemo(
        () =>
            getUpcomingElectronicHorizonAlerts({
                alprNodes,
                electronicHorizon,
                pathCoordinates: coordinates,
                policeAlerts,
            }),
        [alprNodes, coordinates, electronicHorizon, policeAlerts],
    );

    return { alprNodes, upcomingAlerts };
}
