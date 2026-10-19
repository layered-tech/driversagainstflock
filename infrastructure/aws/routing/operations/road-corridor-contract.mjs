import assert from 'node:assert/strict';

// Phase 1 contract for the exporter. These are retained source-OSM semantics,
// not GraphHopper routing speeds, inferred node connections, or default tags.
const ROAD_CLASSES = new Set([
    'motorway',
    'motorway_link',
    'trunk',
    'trunk_link',
    'primary',
    'primary_link',
    'secondary',
    'secondary_link',
    'tertiary',
    'tertiary_link',
    'unclassified',
    'residential',
    'living_street',
    'service',
    'road',
]);

function requireValue(condition, message) {
    if (!condition) throw new Error(`Road corridor contract: ${message}`);
}

/**
 * Validate assembled tile records before the permissive mobile API normalizer.
 * GraphHopper edges must retain source geometry, OSM node IDs and way identity.
 * Direction and directional limits must be oriented to the exported coordinates.
 * Restricted/non-drivable ways must already be excluded using corridor rules.
 * A missing speed limit is explicitly null; omitted metadata is a build failure.
 */
export function validateRoadCorridorWays(ways) {
    requireValue(Array.isArray(ways) && ways.length > 0, 'no roads');
    const ids = new Set();
    const nodes = new Map();
    for (const way of ways) {
        requireValue(
            way && typeof way.id === 'string' && way.id.length > 0,
            'missing road ID',
        );
        requireValue(!ids.has(way.id), `duplicate road ${way.id}`);
        ids.add(way.id);
        requireValue(
            Number.isSafeInteger(way.osm_way_id) && way.osm_way_id > 0,
            `${way.id}: missing OSM way ID`,
        );
        requireValue(
            way.continuity_id === `osm-way-${way.osm_way_id}`,
            `${way.id}: missing source continuity`,
        );
        requireValue(
            ['forward', 'backward', 'both'].includes(way.direction),
            `${way.id}: invalid direction`,
        );
        requireValue(
            ROAD_CLASSES.has(way.road_class),
            `${way.id}: unsupported road class`,
        );
        requireValue(
            typeof way.is_roundabout === 'boolean' &&
                typeof way.tunnel === 'boolean',
            `${way.id}: missing road flags`,
        );
        requireValue(Number.isInteger(way.layer), `${way.id}: missing layer`);
        for (const key of [
            'name',
            'ref',
            'maxspeed',
            'maxspeed_forward',
            'maxspeed_backward',
        ]) {
            requireValue(
                way[key] === null || typeof way[key] === 'string',
                `${way.id}: missing ${key}`,
            );
        }
        for (const key of [
            'speed_limit_mph',
            'speed_limit_forward_mph',
            'speed_limit_backward_mph',
        ]) {
            requireValue(
                way[key] === null ||
                    (Number.isFinite(way[key]) && way[key] >= 0),
                `${way.id}: invalid ${key}`,
            );
        }
        requireValue(
            Array.isArray(way.coordinates) && way.coordinates.length >= 2,
            `${way.id}: missing geometry`,
        );
        requireValue(
            Array.isArray(way.node_ids) &&
                way.node_ids.length === way.coordinates.length,
            `${way.id}: missing source nodes`,
        );
        way.coordinates.forEach((coordinate, index) => {
            requireValue(
                Array.isArray(coordinate) &&
                    coordinate.length === 2 &&
                    coordinate.every(Number.isFinite) &&
                    Math.abs(coordinate[0]) <= 180 &&
                    Math.abs(coordinate[1]) <= 90,
                `${way.id}: invalid coordinate`,
            );
            const nodeId = way.node_ids[index];
            requireValue(
                Number.isSafeInteger(nodeId) && nodeId > 0,
                `${way.id}: invalid source node`,
            );
            const encoded = JSON.stringify(coordinate);
            requireValue(
                !nodes.has(nodeId) || nodes.get(nodeId) === encoded,
                `${way.id}: conflicting node ${nodeId}`,
            );
            requireValue(
                index === 0 ||
                    JSON.stringify(way.coordinates[index - 1]) !== encoded,
                `${way.id}: zero-length segment`,
            );
            nodes.set(nodeId, encoded);
        });
    }
    return ways;
}

/**
 * Compare graphs constructed by the real mobile adapter from the same snapshot.
 * Only exporter-local edge IDs and segment indexes may differ. Source node IDs,
 * road continuity, geometry, direction, bearing and all feature metadata must match.
 * This intentionally blocks geometry simplification and lost/extra road segments.
 */
export function assertRoadCorridorGraphParity(reference, candidate) {
    const segments = (graph) =>
        graph.edges
            .map(({ id, index, ...edge }) => edge)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.deepEqual(
        segments(candidate),
        segments(reference),
        'Corridor feature parity failed',
    );
}
