import { useSyncExternalStore } from 'react';
import { APP_ENVIRONMENT } from './config';
import {
    DIRECTIONS_DEBUG_AVOID_POLYGONS,
    DIRECTIONS_DEBUG_DESTINATION_LINE,
    DIRECTIONS_DEBUG_ENDPOINT_BUFFERS,
    DIRECTIONS_DEBUG_SEARCH_ZONE,
    normalizeDirectionsRouteResponse,
} from './directions';
import { getCoordinateDistanceMeters, getStoredNumber } from './geo';
import {
    pewaukeeCoordinates,
    pewaukeeDirections,
    pewaukeeStops,
} from './pewaukee-drive-fixture';
import { getMockSpeedLimitSnapshot } from './speed-limit-mock';

const E2E_MAP_API_MOCKS_ENV = process.env.EXPO_PUBLIC_E2E_MAP_API_MOCKS === '1';

let runtimeMapApiMocksEnabled = false;
let runtimeMockWazePoliceAlertsEnabled = false;
const mockWazePoliceAlertsListeners = new Set();

const MOCK_WAZE_POLICE_NODES = [
    {
        city: 'Wauwatosa',
        confidence: 2,
        id: 'mock-waze-police-hidden-node',
        latitude: 43.10909992150568,
        longitude: -88.24500056104138,
        num_thumbs_up: 0,
        published_at: null,
        reliability: 7,
        street: 'Mock Waze police node',
        subtype: 'POLICE_HIDING',
    },
];

const MOCK_PLACES = {
    ...Object.fromEntries(
        pewaukeeStops.map(({ id, name, address, coordinate }) => [
            id,
            {
                id,
                displayName: { text: name },
                formattedAddress: address,
                location: { latitude: coordinate[1], longitude: coordinate[0] },
            },
        ]),
    ),
    'mock-walmart-supercenter': {
        businessStatus: 'OPERATIONAL',
        displayName: { text: 'Walmart Supercenter' },
        formattedAddress: '1030 Norwood Park Blvd, Austin, TX 78753',
        id: 'mock-walmart-supercenter',
        location: {
            latitude: 30.3398,
            longitude: -97.7069,
        },
        primaryType: 'department_store',
        primaryTypeDisplayName: { text: 'Department store' },
        types: ['department_store', 'store', 'establishment'],
    },
    'mock-walmart-neighborhood-market': {
        businessStatus: 'OPERATIONAL',
        displayName: { text: 'Walmart Neighborhood Market' },
        formattedAddress: '2525 W Anderson Ln, Austin, TX 78757',
        id: 'mock-walmart-neighborhood-market',
        location: {
            latitude: 30.358,
            longitude: -97.7345,
        },
        primaryType: 'grocery_store',
        primaryTypeDisplayName: { text: 'Grocery store' },
        types: ['grocery_store', 'store', 'establishment'],
    },
    'mock-barton-springs-pool': {
        displayName: { text: 'Barton Springs Pool' },
        formattedAddress: '2201 William Barton Dr, Austin, TX 78746',
        id: 'mock-barton-springs-pool',
        location: {
            latitude: 30.264,
            longitude: -97.7713,
        },
        primaryType: 'public_swimming_pool',
        primaryTypeDisplayName: { text: 'Swimming pool' },
    },
    'mock-austin-central-library': {
        displayName: { text: 'Austin Central Library' },
        formattedAddress: '710 W Cesar Chavez St, Austin, TX 78701',
        id: 'mock-austin-central-library',
        location: {
            latitude: 30.2654,
            longitude: -97.7518,
        },
        primaryType: 'library',
        primaryTypeDisplayName: { text: 'Public library' },
    },
    'mock-cypress-residence': {
        displayName: { text: '2140 Cypress Ave' },
        formattedAddress: '2140 Cypress Ave, Austin, TX 78704',
        id: 'mock-cypress-residence',
        location: {
            latitude: 30.2478,
            longitude: -97.7682,
        },
        primaryType: 'street_address',
        primaryTypeDisplayName: { text: 'Residential' },
        types: ['street_address', 'premise'],
    },
};

const MOCK_SEARCH_RESULTS = [
    ...pewaukeeStops.map(({ id, name, address }) => ({
        id,
        placeId: id,
        primaryText: name,
        secondaryText: address,
        label: address,
    })),
    {
        id: 'mock-walmart-supercenter',
        label: 'Walmart Supercenter, 1030 Norwood Park Blvd, Austin, TX 78753',
        placeId: 'mock-walmart-supercenter',
        primaryText: 'Walmart Supercenter',
        secondaryText: '1030 Norwood Park Blvd, Austin, TX 78753',
    },
    {
        id: 'mock-walmart-neighborhood-market',
        label: 'Walmart Neighborhood Market, 2525 W Anderson Ln, Austin, TX 78757',
        placeId: 'mock-walmart-neighborhood-market',
        primaryText: 'Walmart Neighborhood Market',
        secondaryText: '2525 W Anderson Ln, Austin, TX 78757',
    },
    {
        id: 'mock-barton-springs-pool',
        label: 'Barton Springs Pool, 2201 William Barton Dr, Austin, TX 78746',
        placeId: 'mock-barton-springs-pool',
        primaryText: 'Barton Springs Pool',
        secondaryText: '2201 William Barton Dr, Austin, TX 78746',
    },
    {
        id: 'mock-austin-central-library',
        label: 'Austin Central Library, 710 W Cesar Chavez St, Austin, TX 78701',
        placeId: 'mock-austin-central-library',
        primaryText: 'Austin Central Library',
        secondaryText: '710 W Cesar Chavez St, Austin, TX 78701',
    },
    {
        id: 'mock-cypress-residence',
        label: '2140 Cypress Ave, Austin, TX 78704',
        placeId: 'mock-cypress-residence',
        primaryText: '2140 Cypress Ave',
        secondaryText: 'Austin, TX 78704',
    },
];

const MOCK_MARKER_POINTS = [
    {
        location: [-97.74035, 30.26715],
        properties: {
            created_at: '2026-04-30T09:31:40.000000Z',
            direction: '90',
            heading: '90',
            id: 'mock-austin-alpr-marker',
            osm_id: 'node/1234567890',
            osm_version: 1,
            osm_nodes: [
                {
                    node_id: 1234567890,
                    tags: {
                        'brand:wikidata': 'Q108485435',
                        'camera:direction': '90',
                        'camera:mount': 'pole',
                        'camera:type': 'fixed',
                        man_made: 'surveillance',
                        manufacturer: 'Flock Safety',
                        operator: 'Austin Transportation and Public Works',
                        surveillance: 'public',
                        'surveillance:zone': 'traffic',
                        'surveillance:type': 'ALPR',
                    },
                },
            ],
        },
    },
];

// Offsets keep mock police alerts within a mile or two of whatever location the
// e2e emulator reports, so they are always visible near the mocked user.
const MOCK_WAZE_POLICE_ALERT_OFFSETS = [
    {
        latitudeOffset: 0.012,
        longitudeOffset: -0.008,
        numThumbsUp: 4,
        reliability: 8,
        street: 'N Lamar Blvd',
        subtype: '',
    },
    {
        latitudeOffset: -0.009,
        longitudeOffset: 0.011,
        numThumbsUp: 1,
        reliability: 6,
        street: 'S Congress Ave',
        subtype: 'POLICE_HIDING',
    },
    {
        latitudeOffset: 0.004,
        longitudeOffset: 0.016,
        numThumbsUp: 0,
        reliability: 5,
        street: 'E 7th St',
        subtype: '',
    },
];

function getMockSearchResultDistanceMeters(result, origin) {
    const originLatitude = getStoredNumber(origin?.latitude);
    const originLongitude = getStoredNumber(origin?.longitude);
    const place = MOCK_PLACES[result.placeId];
    const placeLatitude = getStoredNumber(place?.location?.latitude);
    const placeLongitude = getStoredNumber(place?.location?.longitude);

    if (
        originLatitude === null ||
        originLongitude === null ||
        placeLatitude === null ||
        placeLongitude === null
    ) {
        return null;
    }

    return getCoordinateDistanceMeters(
        [originLongitude, originLatitude],
        [placeLongitude, placeLatitude],
    );
}

function appCanUseE2EMapApiMocks() {
    return APP_ENVIRONMENT === 'e2e' || APP_ENVIRONMENT === 'development';
}

export function e2eMapApiMocksCanBeEnabled() {
    return appCanUseE2EMapApiMocks();
}

function throwIfAborted(signal) {
    if (!signal?.aborted) {
        return;
    }

    const error = new Error('Request aborted.');
    error.name = 'AbortError';
    throw error;
}

export function mapApiMocksAreEnabled() {
    return (
        appCanUseE2EMapApiMocks() &&
        (E2E_MAP_API_MOCKS_ENV || runtimeMapApiMocksEnabled)
    );
}

export function setMapApiMocksEnabled(enabled) {
    if (appCanUseE2EMapApiMocks()) {
        runtimeMapApiMocksEnabled = Boolean(enabled);
    }
}

export function setMockWazePoliceAlertsEnabled(enabled) {
    const nextEnabled = Boolean(enabled);

    if (nextEnabled === runtimeMockWazePoliceAlertsEnabled) {
        return;
    }

    runtimeMockWazePoliceAlertsEnabled = nextEnabled;
    mockWazePoliceAlertsListeners.forEach((listener) => listener());
}

function subscribeToMockWazePoliceAlerts(listener) {
    mockWazePoliceAlertsListeners.add(listener);

    return () => mockWazePoliceAlertsListeners.delete(listener);
}

function getMockWazePoliceAlertsEnabled() {
    return runtimeMockWazePoliceAlertsEnabled;
}

export function useMockWazePoliceAlertsEnabled() {
    return useSyncExternalStore(
        subscribeToMockWazePoliceAlerts,
        getMockWazePoliceAlertsEnabled,
        getMockWazePoliceAlertsEnabled,
    );
}

export function mockWazePoliceAlertsAreEnabled() {
    return runtimeMockWazePoliceAlertsEnabled;
}

export async function getMockRoadCorridor({ signal }) {
    throwIfAborted(signal);

    return [
        {
            id: 'e2e-pewaukee',
            coordinates: pewaukeeCoordinates,
            nodeIds: pewaukeeCoordinates.map((_, index) => `pewaukee-${index}`),
            direction: 'forward',
            roadClass: 'primary',
            priority: 6,
            name: 'Pewaukee Road',
            speedLimit: {
                speed: getMockSpeedLimitSnapshot().speedLimitMph,
                unit: 'mph',
            },
        },
    ];
}

export async function searchMockPlaces({ input, origin, signal }) {
    throwIfAborted(signal);

    const normalizedInput = input.trim().toLowerCase();

    if (!normalizedInput) {
        return [];
    }

    return MOCK_SEARCH_RESULTS.filter((result) =>
        [result.primaryText, result.secondaryText, result.label]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedInput)),
    ).map((result) => ({
        ...result,
        distanceMeters: getMockSearchResultDistanceMeters(result, origin),
    }));
}

export async function searchMockTextPlaces({ input, origin, signal }) {
    throwIfAborted(signal);

    const normalizedInput = input.trim().toLowerCase();

    if (!normalizedInput) {
        return [];
    }

    return MOCK_SEARCH_RESULTS.filter((result) =>
        [result.primaryText, result.secondaryText, result.label]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedInput)),
    ).map((result) => {
        const place = MOCK_PLACES[result.placeId];

        return {
            ...result,
            coordinate: [place.location.longitude, place.location.latitude],
            distanceMeters: getMockSearchResultDistanceMeters(result, origin),
            place,
        };
    });
}

export async function getMockPlaceDetails({ placeId, signal }) {
    throwIfAborted(signal);

    const place = MOCK_PLACES[placeId];

    if (!place) {
        throw new Error('Place location could not be loaded.');
    }

    return place;
}

function makeMockDebugPolygon(
    centerCoordinate,
    longitudeRadius,
    latitudeRadius,
) {
    const [longitude, latitude] = centerCoordinate;

    return [
        [
            [longitude - longitudeRadius, latitude - latitudeRadius],
            [longitude + longitudeRadius, latitude - latitudeRadius],
            [longitude + longitudeRadius, latitude + latitudeRadius],
            [longitude - longitudeRadius, latitude + latitudeRadius],
            [longitude - longitudeRadius, latitude - latitudeRadius],
        ],
    ];
}

function getMockDirectionsDebugGeometry({ end, start }) {
    const longitudePadding = Math.max(
        Math.abs(end.longitude - start.longitude) * 0.15,
        0.006,
    );
    const latitudePadding = Math.max(
        Math.abs(end.latitude - start.latitude) * 0.15,
        0.006,
    );
    const west = Math.min(start.longitude, end.longitude) - longitudePadding;
    const east = Math.max(start.longitude, end.longitude) + longitudePadding;
    const south = Math.min(start.latitude, end.latitude) - latitudePadding;
    const north = Math.max(start.latitude, end.latitude) + latitudePadding;
    const avoidCenter = [
        start.longitude + (end.longitude - start.longitude) * 0.48,
        start.latitude + (end.latitude - start.latitude) * 0.52,
    ];
    const avoidPolygon = makeMockDebugPolygon(
        avoidCenter,
        longitudePadding * 0.22,
        latitudePadding * 0.22,
    );
    const endpointBufferLongitudeRadius = longitudePadding * 0.64;
    const endpointBufferLatitudeRadius = latitudePadding * 0.64;
    const startEndpointBuffer = makeMockDebugPolygon(
        [start.longitude, start.latitude],
        endpointBufferLongitudeRadius,
        endpointBufferLatitudeRadius,
    );
    const endEndpointBuffer = makeMockDebugPolygon(
        [end.longitude, end.latitude],
        endpointBufferLongitudeRadius,
        endpointBufferLatitudeRadius,
    );

    return {
        exclusionZone: {
            type: 'Feature',
            geometry: {
                type: 'MultiPolygon',
                coordinates: [avoidPolygon],
            },
            properties: {
                debugRole: DIRECTIONS_DEBUG_AVOID_POLYGONS,
            },
        },
        debugGeometry: {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [start.longitude, start.latitude],
                            [end.longitude, end.latitude],
                        ],
                    },
                    properties: {
                        debugRole: DIRECTIONS_DEBUG_DESTINATION_LINE,
                    },
                },
                {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [west, south],
                                [east, south],
                                [east, north],
                                [west, north],
                                [west, south],
                            ],
                        ],
                    },
                    properties: {
                        debugRole: DIRECTIONS_DEBUG_SEARCH_ZONE,
                    },
                },
                {
                    type: 'Feature',
                    geometry: {
                        type: 'MultiPolygon',
                        coordinates: [startEndpointBuffer, endEndpointBuffer],
                    },
                    properties: {
                        debugRole: DIRECTIONS_DEBUG_ENDPOINT_BUFFERS,
                    },
                },
                {
                    type: 'Feature',
                    geometry: {
                        type: 'MultiPolygon',
                        coordinates: [avoidPolygon],
                    },
                    properties: {
                        debugRole: DIRECTIONS_DEBUG_AVOID_POLYGONS,
                    },
                },
            ],
        },
    };
}

export async function getMockDirections({
    end,
    showZone = false,
    signal,
    start,
    waypoints = [],
}) {
    throwIfAborted(signal);

    const savedDirections = pewaukeeDirections(start, end, waypoints);
    if (!savedDirections) {
        throw new Error(
            'No saved Pewaukee drive matches these endpoints and waypoints.',
        );
    }

    const debug = showZone
        ? getMockDirectionsDebugGeometry({ start, end })
        : {};
    return {
        debugGeometry: debug.debugGeometry ?? null,
        exclusionZone: debug.exclusionZone ?? null,
        route: normalizeDirectionsRouteResponse(savedDirections),
    };
}

export async function getMockSpeedLimit({ signal } = {}) {
    throwIfAborted(signal);

    return getMockSpeedLimitSnapshot();
}

export async function getMockMarkerPoints({ signal } = {}) {
    throwIfAborted(signal);

    return MOCK_MARKER_POINTS;
}

export async function getMockWazePoliceAlerts({ center, signal } = {}) {
    throwIfAborted(signal);

    const latitude = getStoredNumber(center?.latitude);
    const longitude = getStoredNumber(center?.longitude);

    if (latitude === null || longitude === null) {
        return [];
    }

    if (runtimeMockWazePoliceAlertsEnabled) {
        return MOCK_WAZE_POLICE_NODES.map((node) => ({
            ...node,
            published_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        }));
    }

    return MOCK_WAZE_POLICE_ALERT_OFFSETS.map((alertOffset, index) => ({
        city: 'Austin',
        confidence: 2,
        id: `mock-police-alert-${index + 1}`,
        latitude: latitude + alertOffset.latitudeOffset,
        longitude: longitude + alertOffset.longitudeOffset,
        num_thumbs_up: alertOffset.numThumbsUp,
        published_at: new Date(
            Date.now() - (index + 1) * 7 * 60 * 1000,
        ).toISOString(),
        reliability: alertOffset.reliability,
        street: alertOffset.street,
        subtype: alertOffset.subtype,
    }));
}

export function getMockMarkerPointsSnapshot() {
    return MOCK_MARKER_POINTS;
}
