// Synthetic Wisconsin coordinates: source contract fixtures, not a GH export.
export const corridorCoordinate = (x, y) => [
    -89.4 + x / 81500,
    43.07 + y / 111320,
];

function way(id, offsets, nodeIds, properties = {}) {
    return {
        id: `osm-way-${id}`,
        osm_way_id: id,
        coordinates: offsets.map(([x, y]) => corridorCoordinate(x, y)),
        node_ids: nodeIds,
        direction: 'both',
        name: 'Main Street',
        ref: null,
        road_class: 'primary',
        is_roundabout: false,
        tunnel: false,
        layer: 0,
        maxspeed: '35 mph',
        maxspeed_forward: '35 mph',
        maxspeed_backward: '25 mph',
        speed_limit_mph: 35,
        speed_limit_forward_mph: 35,
        speed_limit_backward_mph: 25,
        ...properties,
    };
}

export const baselineCorridorWays = [
    way(
        100,
        [
            [0, 0],
            [100, 0],
            [200, 0],
            [300, 0],
        ],
        [1, 2, 3, 4],
    ),
    way(
        101,
        [
            [200, 0],
            [260, 15],
            [320, 40],
        ],
        [3, 5, 6],
        { direction: 'forward', road_class: 'primary_link' },
    ),
    way(
        102,
        [
            [100, -100],
            [100, 0],
            [100, 100],
        ],
        [7, 8, 9],
        { layer: 1, name: 'Overpass' },
    ),
    way(
        103,
        [
            [0, 15],
            [100, 15],
            [200, 15],
        ],
        [10, 11, 12],
        { direction: 'backward', name: 'Opposite carriageway' },
    ),
    way(
        104,
        [
            [300, 0],
            [350, 0],
            [375, 25],
            [350, 50],
            [325, 25],
            [350, 0],
        ],
        [4, 13, 14, 15, 16, 13],
        { direction: 'forward', is_roundabout: true },
    ),
    way(
        105,
        [
            [350, 50],
            [350, 150],
        ],
        [15, 17],
        { tunnel: true, layer: -1 },
    ),
    way(
        106,
        [
            [350, 150],
            [350, 250],
        ],
        [17, 18],
        {
            road_class: 'residential',
            maxspeed: null,
            maxspeed_forward: null,
            maxspeed_backward: null,
            speed_limit_mph: null,
            speed_limit_forward_mph: null,
            speed_limit_backward_mph: null,
        },
    ),
];

// Simulate post-import edge splitting/reordering while preserving source data.
// Phase 3 must run the same gate on a real exported artifact.
export function splitCorridorWays() {
    return baselineCorridorWays
        .flatMap((source) =>
            source.coordinates.slice(1).map((_, index) => ({
                ...structuredClone(source),
                id: `gh-edge-${source.osm_way_id}-${index}`,
                continuity_id: source.id,
                coordinates: source.coordinates.slice(index, index + 2),
                node_ids: source.node_ids.slice(index, index + 2),
            })),
        )
        .reverse();
}
