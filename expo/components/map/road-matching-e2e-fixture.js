const ORIGIN = Object.freeze([-97.7431, 30.2672]);
const METERS_PER_LATITUDE_DEGREE = 111132;
const METERS_PER_LONGITUDE_DEGREE =
    111320 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function getE2ERoadCoordinate(xMeters, yMeters) {
    return [
        ORIGIN[0] + xMeters / METERS_PER_LONGITUDE_DEGREE,
        ORIGIN[1] + yMeters / METERS_PER_LATITUDE_DEGREE,
    ];
}

const coordinates = Object.freeze({
    branchEnd: getE2ERoadCoordinate(300, 300),
    frontageEnd: getE2ERoadCoordinate(650, 35),
    frontageMiddle: getE2ERoadCoordinate(0, 35),
    frontageStart: getE2ERoadCoordinate(-700, 35),
    mainEnd: getE2ERoadCoordinate(300, 0),
    mainMiddle: getE2ERoadCoordinate(0, 0),
    mainStart: getE2ERoadCoordinate(-700, 0),
    speed45End: getE2ERoadCoordinate(650, 0),
});

export const E2E_ROAD_MATCHING_LOCATIONS = Object.freeze({
    // Keep this fix away from mainMiddle so segment selection cannot depend on
    // floating-point tie breaking at the shared graph node.
    // Keep raw fixes 24 meters away from their matched roads so the native
    // puck render query can distinguish the two screen coordinates.
    main35: getE2ERoadCoordinate(-100, -24),
    main45: getE2ERoadCoordinate(400, -24),
    parallelFrontage: getE2ERoadCoordinate(-500, 45),
    parallelRoadAmbiguous: getE2ERoadCoordinate(100, 16),
});

export const E2E_ROAD_CORRIDOR_WAYS = Object.freeze([
    {
        coordinates: [
            coordinates.mainStart,
            coordinates.mainMiddle,
            coordinates.mainEnd,
        ],
        direction: 'forward',
        id: 'e2e-main-35',
        name: 'Congress Avenue',
        nodeIds: ['main-start', 'main-middle', 'main-end'],
        osmWayId: 900001,
        priority: 6,
        roadClass: 'primary',
        speedLimit: { speed: 35, speedLimitMph: 35, unit: 'mph' },
    },
    {
        coordinates: [coordinates.mainEnd, coordinates.speed45End],
        direction: 'forward',
        id: 'e2e-main-45',
        name: 'Congress Avenue',
        nodeIds: ['main-end', 'main-east'],
        osmWayId: 900002,
        priority: 6,
        roadClass: 'primary',
        speedLimit: { speed: 45, speedLimitMph: 45, unit: 'mph' },
    },
    {
        coordinates: [
            coordinates.frontageStart,
            coordinates.frontageMiddle,
            coordinates.frontageEnd,
        ],
        direction: 'forward',
        id: 'e2e-frontage',
        name: 'Frontage Road',
        nodeIds: ['frontage-start', 'frontage-middle', 'frontage-end'],
        osmWayId: 900003,
        priority: 4,
        roadClass: 'secondary',
        speedLimit: { speed: 25, speedLimitMph: 25, unit: 'mph' },
    },
    {
        coordinates: [coordinates.frontageMiddle, coordinates.mainMiddle],
        direction: 'forward',
        id: 'e2e-parallel-connector',
        name: 'Congress Avenue Connector',
        nodeIds: ['frontage-middle', 'main-middle'],
        osmWayId: 900005,
        priority: 1,
        roadClass: 'service',
        speedLimit: { speed: 15, speedLimitMph: 15, unit: 'mph' },
    },
    {
        coordinates: [coordinates.mainEnd, coordinates.branchEnd],
        direction: 'forward',
        id: 'e2e-branch',
        name: 'Lavaca Street',
        nodeIds: ['main-end', 'branch-end'],
        osmWayId: 900004,
        priority: 3,
        roadClass: 'tertiary',
        speedLimit: { speed: 30, speedLimitMph: 30, unit: 'mph' },
    },
]);

export function getE2ERoadCorridorWays() {
    return E2E_ROAD_CORRIDOR_WAYS.map((way) => ({
        ...way,
        coordinates: way.coordinates.map((coordinate) => [...coordinate]),
        nodeIds: [...way.nodeIds],
        speedLimit: { ...way.speedLimit },
    }));
}
