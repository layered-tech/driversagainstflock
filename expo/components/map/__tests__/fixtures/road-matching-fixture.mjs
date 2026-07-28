import { createDirectedRoadGraph } from '../../road-graph.js';

const ORIGIN = Object.freeze([-97.75, 30.25]);
const METERS_PER_LATITUDE_DEGREE = 111132;
const METERS_PER_LONGITUDE_DEGREE =
    111320 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function fixtureCoordinate(xMeters, yMeters) {
    return [
        ORIGIN[0] + xMeters / METERS_PER_LONGITUDE_DEGREE,
        ORIGIN[1] + yMeters / METERS_PER_LATITUDE_DEGREE,
    ];
}

const coordinates = Object.freeze({
    branch1: fixtureCoordinate(200, 100),
    branch2: fixtureCoordinate(200, 200),
    frontage0: fixtureCoordinate(0, 12),
    frontage1: fixtureCoordinate(100, 12),
    frontage2: fixtureCoordinate(200, 12),
    frontage3: fixtureCoordinate(300, 12),
    main0: fixtureCoordinate(0, 0),
    main1: fixtureCoordinate(100, 0),
    main2: fixtureCoordinate(200, 0),
    main3: fixtureCoordinate(300, 0),
    remote0: fixtureCoordinate(1000, 100),
    remote1: fixtureCoordinate(1200, 100),
});

export const FIXTURE_EDGE_IDS = Object.freeze({
    branch0: 'branch:0:forward',
    branch1: 'branch:1:forward',
    connector: 'connector:0:forward',
    frontage0: 'frontage:0:forward',
    frontage1: 'frontage:1:forward',
    frontage2: 'frontage:2:forward',
    main0: 'main:0:forward',
    main1: 'main:1:forward',
    main2: 'main:2:forward',
    remote0: 'remote:0:forward',
});

export const ROAD_MATCHING_FIXTURE_WAYS = Object.freeze([
    {
        coordinates: [
            coordinates.main0,
            coordinates.main1,
            coordinates.main2,
            coordinates.main3,
        ],
        id: 'main',
        layer: 1,
        name: 'Main Street',
        nodeIds: ['main-0', 'main-1', 'main-2', 'main-3'],
        osmWayId: '1001',
        oneWay: true,
        priority: 3,
        roadClass: 'primary',
        speedLimit: { speed: 35, unit: 'mph' },
        tunnel: true,
    },
    {
        coordinates: [
            coordinates.frontage0,
            coordinates.frontage1,
            coordinates.frontage2,
            coordinates.frontage3,
        ],
        id: 'frontage',
        name: 'Frontage Road',
        nodeIds: ['frontage-0', 'frontage-1', 'frontage-2', 'frontage-3'],
        oneWay: true,
        priority: 2,
        speedLimit: { speed: 45, unit: 'mph' },
    },
    {
        coordinates: [coordinates.main1, coordinates.frontage2],
        id: 'connector',
        name: 'Main Street Connector',
        nodeIds: ['main-1', 'frontage-2'],
        oneWay: true,
        priority: 1,
        speedLimit: { speed: 25, unit: 'mph' },
    },
    {
        coordinates: [
            coordinates.main2,
            coordinates.branch1,
            coordinates.branch2,
        ],
        id: 'branch',
        name: 'North Branch',
        nodeIds: ['main-2', 'branch-1', 'branch-2'],
        oneWay: true,
        priority: 1,
        speedLimit: { speed: 25, unit: 'mph' },
    },
    {
        coordinates: [coordinates.remote0, coordinates.remote1],
        id: 'remote',
        name: 'Remote Highway',
        nodeIds: ['remote-0', 'remote-1'],
        oneWay: true,
        priority: 2,
        speedLimit: { speed: 55, unit: 'mph' },
    },
]);

export function createRoadMatchingFixtureGraph() {
    return createDirectedRoadGraph(ROAD_MATCHING_FIXTURE_WAYS);
}

export function makeFixtureObservation({
    accuracy = 3,
    bearing = 90,
    speed = 18,
    timestamp = 1000,
    x,
    y,
}) {
    const [longitude, latitude] = fixtureCoordinate(x, y);

    return {
        accuracy,
        bearing,
        latitude,
        longitude,
        speed,
        timestamp,
    };
}
