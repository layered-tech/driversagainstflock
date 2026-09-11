import {
    getPrivateCacheItem,
    removePrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import {
    BACKGROUND_ALERT_FETCH_TIMEOUT_MS,
    BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
} from './background-alert-budget';
import { createDurableAlertStore } from './durable-alert-store';
import { getElectronicHorizonAlprNodes } from './electronic-horizon-alerts-api';
import { getCoordinateDistanceMeters, getStoredNumber } from './geo';

const ELECTRONIC_HORIZON_ALPR_REFRESH_DISTANCE_METERS = 300;
const ELECTRONIC_HORIZON_ALPR_REFRESH_INTERVAL_MS = 30 * 1000;
const ELECTRONIC_HORIZON_ALPR_PATH_CHANGE_REFRESH_INTERVAL_MS = 10 * 1000;
const ELECTRONIC_HORIZON_ALPR_STORAGE_KEY =
    'driversagainstflock.electronicHorizonAlprSnapshot.v1';
const encryptedAlertStorage = {
    getItem: getPrivateCacheItem,
    removeItem: removePrivateCacheItem,
    setItem: setPrivateCacheItem,
};

export const EMPTY_ELECTRONIC_HORIZON_ALPR_NODES = Object.freeze([]);

const coverageListeners = new Set();
let coverageInput = null;
let sharedCoverageComplete = null;

function setSharedCoverageComplete(coverageComplete) {
    if (sharedCoverageComplete === coverageComplete) {
        return;
    }

    sharedCoverageComplete = coverageComplete;
    coverageListeners.forEach((listener) => listener(coverageComplete));
}

function hasActiveRoutePath(pathStateKey) {
    return (
        typeof pathStateKey === 'string' && pathStateKey.startsWith('route:')
    );
}

export function getElectronicHorizonAlprCoordinatePathStateKey(coordinates) {
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

export function getElectronicHorizonAlprDirectionsRoutePathKey(routeOption) {
    const routeCoordinates = routeOption?.coordinates;

    return [
        routeOption?.routeKey ?? '',
        routeCoordinates?.length ?? '',
        getElectronicHorizonAlprCoordinatePathStateKey(routeCoordinates),
    ].join('|');
}

export function getElectronicHorizonAlprPathStateKey({
    coordinates,
    electronicHorizon,
    pathSource,
    routePathKey,
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

    return `electronic-horizon:${getElectronicHorizonAlprCoordinatePathStateKey(
        coordinates,
    )}`;
}

function normalizeCoordinate(coordinate) {
    const longitude = getStoredNumber(coordinate?.[0]);
    const latitude = getStoredNumber(coordinate?.[1]);

    if (
        longitude === null ||
        latitude === null ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

function normalizeElectronicHorizonAlprInput(input) {
    if (!Array.isArray(input?.coordinates)) {
        return null;
    }

    const coordinates = input.coordinates
        .map(normalizeCoordinate)
        .filter(Boolean);

    if (coordinates.length < 2) {
        return null;
    }

    return {
        coordinates,
        primaryPathKey:
            typeof input.primaryPathKey === 'string'
                ? input.primaryPathKey
                : null,
    };
}

function normalizeElectronicHorizonAlprNode(node, index) {
    const coordinate = normalizeCoordinate(node?.coordinate);
    const osmId = getStoredNumber(node?.osmId);

    if (!coordinate || osmId === null) {
        return null;
    }

    return {
        cameraDirection:
            typeof node.cameraDirection === 'string'
                ? node.cameraDirection
                : null,
        coordinate,
        direction: typeof node.direction === 'string' ? node.direction : null,
        id: String(node.id ?? `osm-node-${osmId}-${index}`),
        osmId,
        tags:
            node.tags &&
            typeof node.tags === 'object' &&
            !Array.isArray(node.tags)
                ? node.tags
                : {},
    };
}

function normalizeElectronicHorizonAlprNodes(nodes) {
    if (!Array.isArray(nodes)) {
        return null;
    }

    const normalizedNodes = nodes.map(normalizeElectronicHorizonAlprNode);

    if (normalizedNodes.some((node) => node === null)) {
        return null;
    }

    return normalizedNodes.length
        ? normalizedNodes
        : EMPTY_ELECTRONIC_HORIZON_ALPR_NODES;
}

function normalizeElectronicHorizonAlprMetadata(metadata) {
    const fetchStartCoordinate = normalizeCoordinate(
        metadata?.fetchStartCoordinate,
    );

    if (!fetchStartCoordinate) {
        return null;
    }

    return {
        fetchStartCoordinate,
        primaryPathKey:
            typeof metadata.primaryPathKey === 'string'
                ? metadata.primaryPathKey
                : null,
    };
}

function electronicHorizonAlprNodesAreFresh(state, input, now) {
    const startCoordinate = input.coordinates[0];

    if (!state.fetchedAt || !state.metadata?.fetchStartCoordinate) {
        return false;
    }

    const ageMs = now - state.fetchedAt;

    if (ageMs >= ELECTRONIC_HORIZON_ALPR_REFRESH_INTERVAL_MS) {
        return false;
    }

    if (
        state.metadata.primaryPathKey !== input.primaryPathKey &&
        (hasActiveRoutePath(state.metadata.primaryPathKey) ||
            hasActiveRoutePath(input.primaryPathKey) ||
            ageMs >= ELECTRONIC_HORIZON_ALPR_PATH_CHANGE_REFRESH_INTERVAL_MS)
    ) {
        return false;
    }

    const distanceMeters = getCoordinateDistanceMeters(
        state.metadata.fetchStartCoordinate,
        startCoordinate,
    );

    return (
        distanceMeters !== null &&
        distanceMeters < ELECTRONIC_HORIZON_ALPR_REFRESH_DISTANCE_METERS
    );
}

function electronicHorizonAlprInputsAreEquivalent(firstInput, secondInput) {
    if (!firstInput || !secondInput) {
        return false;
    }

    if (firstInput.primaryPathKey !== secondInput.primaryPathKey) {
        return false;
    }

    const distanceMeters = getCoordinateDistanceMeters(
        firstInput.coordinates[0],
        secondInput.coordinates[0],
    );

    return (
        distanceMeters !== null &&
        distanceMeters < ELECTRONIC_HORIZON_ALPR_REFRESH_DISTANCE_METERS
    );
}

const electronicHorizonAlprStore = createDurableAlertStore({
    emptyItems: EMPTY_ELECTRONIC_HORIZON_ALPR_NODES,
    fetchItems: async (input, signal) => {
        const result = await getElectronicHorizonAlprNodes({
            coordinates: input.coordinates,
            signal,
        });

        if (electronicHorizonAlprInputsAreEquivalent(input, coverageInput)) {
            setSharedCoverageComplete(result.coverageComplete);
        }

        return result.nodes;
    },
    getMetadataForInput: ({ coordinates, primaryPathKey }) => ({
        fetchStartCoordinate: coordinates[0],
        primaryPathKey,
    }),
    inputsAreEquivalent: electronicHorizonAlprInputsAreEquivalent,
    isFresh: electronicHorizonAlprNodesAreFresh,
    normalizeInput: normalizeElectronicHorizonAlprInput,
    normalizeItems: normalizeElectronicHorizonAlprNodes,
    normalizeMetadata: normalizeElectronicHorizonAlprMetadata,
    storage: encryptedAlertStorage,
    storageKey: ELECTRONIC_HORIZON_ALPR_STORAGE_KEY,
    storageTimeoutMs: BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
    timeoutMs: BACKGROUND_ALERT_FETCH_TIMEOUT_MS,
});

export function addElectronicHorizonAlprNodesListener(listener) {
    return electronicHorizonAlprStore.addListener(listener);
}

export function addElectronicHorizonAlprCoverageListener(listener) {
    coverageListeners.add(listener);

    return {
        remove() {
            coverageListeners.delete(listener);
        },
    };
}

export function getSharedElectronicHorizonAlprNodes() {
    return electronicHorizonAlprStore.getItems();
}

export function getSharedElectronicHorizonAlprCoverageComplete() {
    return sharedCoverageComplete;
}

export function hydrateElectronicHorizonAlprNodes() {
    return electronicHorizonAlprStore.hydrate();
}

export function refreshElectronicHorizonAlprNodesIfStale({
    coordinates,
    primaryPathKey,
}) {
    const nextCoverageInput = normalizeElectronicHorizonAlprInput({
        coordinates,
        primaryPathKey,
    });

    if (
        nextCoverageInput &&
        (!coverageInput ||
            !electronicHorizonAlprInputsAreEquivalent(
                coverageInput,
                nextCoverageInput,
            ))
    ) {
        coverageInput = nextCoverageInput;
        setSharedCoverageComplete(null);
    }

    return electronicHorizonAlprStore.refreshIfStale({
        coordinates,
        primaryPathKey,
    });
}
