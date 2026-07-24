import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createDirectedRoadGraph,
    getRoadCandidateProjections,
    getRoadCoordinateDistanceMeters,
    getRoadTransitionDistanceMeters,
} from '../road-graph.js';
import { predictRoadLookAhead } from '../road-look-ahead.js';
import {
    E2E_ROAD_MATCHING_LOCATIONS,
    getE2ERoadCoordinate,
    getE2ERoadCorridorWays,
} from '../road-matching-e2e-fixture.js';
import { createRoadMatcher } from '../road-matching.js';

function getFixtureMatch(graph, matcher, location, timestamp = 1) {
    const matchedLocation = matcher.update({
        accuracy: 5,
        latitude: location[1],
        longitude: location[0],
        timestamp,
    });
    const lookAhead = predictRoadLookAhead({
        graph,
        matchedLocation,
        maximumDistanceMeters: 2000,
    });

    return {
        coordinate: `${matchedLocation.longitude.toFixed(7)},${matchedLocation.latitude.toFixed(7)}`,
        edgeId: matchedLocation.roadMatch.edgeId,
        lookAheadEdgeIds: lookAhead.primaryPath.segments.map(
            (segment) => segment.edgeId,
        ),
        speedLimitMph: matchedLocation.speedLimit.speedLimitMph,
    };
}

function matchFixtureLocation(location) {
    const graph = createDirectedRoadGraph(getE2ERoadCorridorWays());

    return getFixtureMatch(graph, createRoadMatcher(graph), location);
}

describe('road matching Maestro fixture', () => {
    test('has deterministic free-drive speed-zone matches', () => {
        assert.deepEqual(
            matchFixtureLocation(E2E_ROAD_MATCHING_LOCATIONS.main35),
            {
                coordinate: '-97.7441401,30.2672000',
                edgeId: 'e2e-main-35:0:forward',
                lookAheadEdgeIds: [
                    'e2e-main-35:0:forward',
                    'e2e-main-35:1:forward',
                    'e2e-main-45:0:forward',
                ],
                speedLimitMph: 35,
            },
        );
        assert.deepEqual(
            matchFixtureLocation(E2E_ROAD_MATCHING_LOCATIONS.main45),
            {
                coordinate: '-97.7389396,30.2672000',
                edgeId: 'e2e-main-45:0:forward',
                lookAheadEdgeIds: ['e2e-main-45:0:forward'],
                speedLimitMph: 45,
            },
        );
    });

    test('retains the legal frontage-road trace at an ambiguous parallel fix', () => {
        const graph = createDirectedRoadGraph(getE2ERoadCorridorWays());
        const matcher = createRoadMatcher(graph);
        const frontageCandidate = getRoadCandidateProjections(
            graph,
            E2E_ROAD_MATCHING_LOCATIONS.parallelFrontage,
            30,
        ).find(
            (candidate) => candidate.segment.id === 'e2e-frontage:0:forward',
        );
        const mainCandidate = getRoadCandidateProjections(
            graph,
            E2E_ROAD_MATCHING_LOCATIONS.parallelRoadAmbiguous,
            30,
        ).find((candidate) => candidate.segment.id === 'e2e-main-35:1:forward');
        const legalRampTransitionDistance = getRoadTransitionDistanceMeters(
            graph,
            frontageCandidate,
            mainCandidate,
        );

        assert.ok(frontageCandidate);
        assert.ok(mainCandidate);
        assert.ok(legalRampTransitionDistance > 630);
        assert.ok(legalRampTransitionDistance < 640);
        assert.ok(
            getRoadCoordinateDistanceMeters(
                E2E_ROAD_MATCHING_LOCATIONS.parallelFrontage,
                E2E_ROAD_MATCHING_LOCATIONS.parallelRoadAmbiguous,
            ) > 500,
        );

        assert.deepEqual(
            getFixtureMatch(
                graph,
                matcher,
                E2E_ROAD_MATCHING_LOCATIONS.parallelFrontage,
                1000,
            ),
            {
                coordinate: '-97.7483005,30.2675149',
                edgeId: 'e2e-frontage:0:forward',
                lookAheadEdgeIds: [
                    'e2e-frontage:0:forward',
                    'e2e-frontage:1:forward',
                ],
                speedLimitMph: 25,
            },
        );
        [
            getE2ERoadCoordinate(-300, 45),
            getE2ERoadCoordinate(-100, 45),
            getE2ERoadCoordinate(80, 45),
        ].forEach((location, index) => {
            const match = getFixtureMatch(
                graph,
                matcher,
                location,
                index * 3000 + 4000,
            );

            assert.match(match.edgeId, /^e2e-frontage:/);
            assert.equal(match.speedLimitMph, 25);
        });
        assert.deepEqual(
            getFixtureMatch(
                graph,
                matcher,
                E2E_ROAD_MATCHING_LOCATIONS.parallelRoadAmbiguous,
                13000,
            ),
            {
                coordinate: '-97.7420599,30.2675149',
                edgeId: 'e2e-frontage:1:forward',
                lookAheadEdgeIds: ['e2e-frontage:1:forward'],
                speedLimitMph: 25,
            },
        );
    });

    test('can switch from the frontage road through the legal ramp', () => {
        const graph = createDirectedRoadGraph(getE2ERoadCorridorWays());
        const matcher = createRoadMatcher(graph);
        const observations = [
            getE2ERoadCoordinate(-50, 35),
            getE2ERoadCoordinate(0, 17.5),
            getE2ERoadCoordinate(50, 0),
        ];
        const results = observations.map(([longitude, latitude], index) =>
            matcher.update({
                accuracy: 3,
                latitude,
                longitude,
                speed: 12,
                timestamp: index * 3000 + 1000,
            }),
        );

        assert.deepEqual(
            results.map((result) => result.roadMatch.edgeId),
            [
                'e2e-frontage:0:forward',
                'e2e-parallel-connector:0:forward',
                'e2e-main-35:1:forward',
            ],
        );
    });
});
