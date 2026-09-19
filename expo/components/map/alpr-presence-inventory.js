import {
    presenceCoordinate,
    presenceDistance,
} from './alpr-presence-policy.js';

const RETENTION_MS = 120000;
const RETENTION_METERS = 3000;
const longitudeDelta = (a, b) => ((a - b + 540) % 360) - 180;

function cameraNode(marker) {
    const properties = marker?.properties;
    const tags = properties?.osm_nodes?.[0]?.tags ?? {};
    const coordinate = marker?.location ?? marker?.geometry?.coordinates;
    const id = Number(properties?.osm_id);
    if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !Array.isArray(coordinate) ||
        !coordinate.every(Number.isFinite) ||
        coordinate.length !== 2 ||
        (tags['surveillance:type'] !== 'ALPR' &&
            properties?.type !== 'OpenStreetMap ALPR')
    )
        return null;
    return {
        osm_id: id,
        longitude: coordinate[0],
        latitude: coordinate[1],
        tags,
    };
}

/** Shares the map's broad marker inventory; never issues an electronic-horizon request. */
export function createPresenceInventory({
    getLocation,
    getMapInventory,
    now = Date.now,
}) {
    let lastPoints = null;
    let currentNodes = new Map();
    const retained = new Map();
    let disposed = false;
    return {
        getContext() {
            const map = disposed ? {} : getMapInventory();
            const points = map.markerPoints ?? [];
            const time = now();
            const vehicle = presenceCoordinate(getLocation());
            if (points !== lastPoints) {
                for (const [id, node] of currentNodes)
                    retained.set(id, { node, removedAt: time });
                currentNodes = new Map(
                    points
                        .map(cameraNode)
                        .filter(Boolean)
                        .map((node) => [node.osm_id, node]),
                );
                for (const id of currentNodes.keys()) retained.delete(id);
                lastPoints = points;
            }
            for (const [id, item] of retained) {
                if (
                    disposed ||
                    time - item.removedAt >= RETENTION_MS ||
                    presenceDistance(vehicle, presenceCoordinate(item.node)) >
                        RETENTION_METERS
                )
                    retained.delete(id);
            }
            const bounds = map.markerCoverage?.bounds;
            let center = null;
            let radius = null;
            let distance = null;
            let complete = false;
            if (
                bounds &&
                ['sw_lng', 'sw_lat', 'ne_lng', 'ne_lat'].every((key) =>
                    Number.isFinite(bounds[key]),
                )
            ) {
                const longitudeSpan =
                    (bounds.ne_lng - bounds.sw_lng + 360) % 360;
                const latitude = (bounds.sw_lat + bounds.ne_lat) / 2;
                center = [
                    longitudeDelta(bounds.sw_lng + longitudeSpan / 2, 0),
                    latitude,
                ];
                radius =
                    (Math.min(
                        longitudeSpan * Math.cos((latitude * Math.PI) / 180),
                        bounds.ne_lat - bounds.sw_lat,
                    ) *
                        111195) /
                    2;
                distance = presenceDistance(
                    [
                        center[0] + longitudeDelta(vehicle[0], center[0]),
                        vehicle[1],
                    ],
                    center,
                );
                // Reserve room for the approach, isolation check and confirmation frame.
                complete = Number.isFinite(distance) && distance + 750 < radius;
            }
            return {
                nodes: [
                    ...currentNodes.values(),
                    ...Array.from(retained.values(), (item) => item.node),
                ].filter(
                    (node) =>
                        presenceDistance(vehicle, presenceCoordinate(node)) <=
                        RETENTION_METERS,
                ),
                inventoryStatus: map.markersAreLoading
                    ? 'loading map markers'
                    : map.markerLoadError
                      ? 'map refresh failed; retained inventory'
                      : bounds
                        ? 'loaded map markers'
                        : 'waiting for map markers',
                inventoryAgeMs: map.markerCoverage
                    ? time - map.markerCoverage.loadedAt
                    : null,
                inventoryDistanceMeters: distance,
                inventorySource: 'map markers',
                retainedNodeCount: retained.size,
                coverageCenter: center,
                coverageRadiusMeters: radius,
                coverageComplete: complete,
            };
        },
        dispose() {
            disposed = true;
            retained.clear();
            currentNodes.clear();
            lastPoints = null;
        },
    };
}
