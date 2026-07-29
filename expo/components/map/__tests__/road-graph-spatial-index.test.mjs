import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createDirectedRoadGraph,
    getRoadCandidateProjections,
    getRoadCandidateSegments,
    projectCoordinateOntoRoadSegment,
} from '../road-graph.js';

const METERS_PER_LATITUDE_DEGREE = 111132;
const METERS_PER_LONGITUDE_DEGREE = 111320;

function coordinateAtMeters(xMeters, yMeters) {
    return [
        xMeters / METERS_PER_LONGITUDE_DEGREE,
        yMeters / METERS_PER_LATITUDE_DEGREE,
    ];
}

function getProjectionDetails(projections) {
    return projections.map((projection) => ({
        coordinate: projection.coordinate,
        distanceMeters: projection.distanceMeters,
        fraction: projection.fraction,
        segmentId: projection.segment.id,
    }));
}

function getExhaustiveCandidateProjections(
    graph,
    coordinate,
    maximumDistanceMeters,
) {
    return graph.edges
        .map((segment) => projectCoordinateOntoRoadSegment(coordinate, segment))
        .filter(
            (projection) =>
                projection &&
                projection.distanceMeters <= maximumDistanceMeters,
        )
        .sort((first, second) => first.distanceMeters - second.distanceMeters);
}

function assertSpatialIndexMatchesExhaustiveLookup(
    graph,
    coordinate,
    maximumDistanceMeters,
) {
    assert.deepEqual(
        getProjectionDetails(
            getRoadCandidateProjections(
                graph,
                coordinate,
                maximumDistanceMeters,
            ),
        ),
        getProjectionDetails(
            getExhaustiveCandidateProjections(
                graph,
                coordinate,
                maximumDistanceMeters,
            ),
        ),
    );
}

function createDenseRoadGraph() {
    const ways = [];

    for (let offsetMeters = -3000; offsetMeters <= 3000; offsetMeters += 50) {
        ways.push({
            coordinates: [
                coordinateAtMeters(offsetMeters, -3000),
                coordinateAtMeters(offsetMeters, 3000),
            ],
            id: `vertical-${offsetMeters}`,
            nodeIds: [
                `vertical-${offsetMeters}-south`,
                `vertical-${offsetMeters}-north`,
            ],
            oneWay: true,
        });
        ways.push({
            coordinates: [
                coordinateAtMeters(-3000, offsetMeters),
                coordinateAtMeters(3000, offsetMeters),
            ],
            id: `horizontal-${offsetMeters}`,
            nodeIds: [
                `horizontal-${offsetMeters}-west`,
                `horizontal-${offsetMeters}-east`,
            ],
            oneWay: true,
        });
    }

    return createDirectedRoadGraph(ways);
}

describe('road graph spatial index', () => {
    test('evaluates a bounded candidate set while preserving exhaustive results', () => {
        const graph = createDenseRoadGraph();
        const coordinate = coordinateAtMeters(110, 110);
        const maximumDistanceMeters = 100;
        const candidateSegments = getRoadCandidateSegments(
            graph,
            coordinate,
            maximumDistanceMeters,
        );

        assert.ok(Object.isFrozen(graph));
        assert.ok(Object.isFrozen(graph.edges));
        assert.ok(Object.isFrozen(graph.spatialIndex));
        assert.ok(Object.isFrozen(graph.spatialIndex.cells));
        assert.ok(Object.isFrozen(graph.spatialIndex.globalEdges));
        assert.ok(
            Object.values(graph.spatialIndex.cells).every((cell) =>
                Object.isFrozen(cell),
            ),
        );
        assert.equal(graph.edges.length, 242);
        assert.equal(candidateSegments.length, 12);
        assertSpatialIndexMatchesExhaustiveLookup(
            graph,
            coordinate,
            maximumDistanceMeters,
        );
    });

    test('matches exhaustive lookup at cell boundaries, the antimeridian, and large radii', () => {
        const cellBoundaryGraph = createDirectedRoadGraph([
            {
                coordinates: [
                    [0, -0.001],
                    [0, 0.001],
                ],
                id: 'cell-boundary',
                nodeIds: ['cell-boundary-south', 'cell-boundary-north'],
                oneWay: true,
            },
        ]);
        const antimeridianGraph = createDirectedRoadGraph([
            {
                coordinates: [
                    [179.99, 0],
                    [-179.99, 0],
                ],
                id: 'antimeridian',
                nodeIds: ['antimeridian-west', 'antimeridian-east'],
                oneWay: true,
            },
        ]);
        const largeRadiusGraph = createDirectedRoadGraph([
            {
                coordinates: [
                    [-170, -45],
                    [-169.5, -45],
                ],
                id: 'large-radius-west',
                nodeIds: ['large-radius-west-a', 'large-radius-west-b'],
                oneWay: true,
            },
            {
                coordinates: [
                    [170, 45],
                    [170.5, 45],
                ],
                id: 'large-radius-east',
                nodeIds: ['large-radius-east-a', 'large-radius-east-b'],
                oneWay: true,
            },
        ]);

        assertSpatialIndexMatchesExhaustiveLookup(
            cellBoundaryGraph,
            [0.0000001, 0],
            1,
        );
        assertSpatialIndexMatchesExhaustiveLookup(
            antimeridianGraph,
            [180, 0],
            10,
        );
        assertSpatialIndexMatchesExhaustiveLookup(
            largeRadiusGraph,
            [0, 0],
            30000000,
        );
        assert.deepEqual(
            getRoadCandidateSegments(largeRadiusGraph, [0, 0], 30000000),
            largeRadiusGraph.edges,
        );

        const antimeridianProjection = getRoadCandidateProjections(
            antimeridianGraph,
            [180, 0],
            10,
        )[0];

        assert.equal(
            antimeridianProjection.segment.id,
            'antimeridian:0:forward',
        );
        assert.ok(antimeridianProjection.distanceMeters < 0.001);
        assert.equal(antimeridianProjection.coordinate[0], 180);
    });
});
