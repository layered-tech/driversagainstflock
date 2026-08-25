import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import { processScorecardExposureSegment } from '../../scorecard/exposure-detection.js';
import {
    getScorecardDriveE2ECoordinateDistanceMeters,
    getScorecardDriveE2EDirectionsFixture,
    getScorecardDriveE2EElectronicHorizonFixture,
    getScorecardDriveE2ERoadCorridorWays,
    getScorecardDriveE2ERouteDistanceMeters,
    getScorecardDriveE2EScenario,
    SCORECARD_DRIVE_E2E_SCENARIOS,
    scorecardDriveE2ECameraInventoryIsReady,
    setScorecardDriveE2EScenario,
} from '../scorecard-drive-e2e-fixture.js';

const MAESTRO_1403_DRIVE_SPEED = 0.2;
const MAESTRO_1403_LOCATION_OVERHEAD_MS = 45;
const MAESTRO_1403_STEPS_PER_SEGMENT = 50;
const ANDROID_LOCATION_DELIVERY_INTERVAL_MS = 1000;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function getMaestro1403TravelDistanceMeters(fromCoordinate, toCoordinate) {
    const [fromLongitude, fromLatitude] = fromCoordinate;
    const [toLongitude, toLatitude] = toCoordinate;
    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const fromLongitudeRadians = degreesToRadians(fromLongitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const toLongitudeRadians = degreesToRadians(toLongitude);
    const latitudeDelta = degreesToRadians(
        toLatitudeRadians - fromLatitudeRadians,
    );
    const longitudeDelta = degreesToRadians(
        toLongitudeRadians - fromLongitudeRadians,
    );
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(degreesToRadians(fromLatitudeRadians)) *
            Math.cos(degreesToRadians(toLatitudeRadians)) *
            Math.sin(longitudeDelta / 2) ** 2;

    return (
        6371 *
        1000 *
        2 *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function makeLocation(coordinate, recordedAt) {
    return {
        accuracy: 5,
        latitude: coordinate[1],
        longitude: coordinate[0],
        recordedAt,
    };
}

function normalizeMonitoringNodeForDetector(node) {
    const direction = node.directions
        .map((range) =>
            range.is_range
                ? `${range.start}-${range.end}`
                : String(range.start),
        )
        .join(';');

    return {
        coordinate: node.coordinate,
        direction: direction || null,
        osmId: String(node.osm_id),
        tags: {
            name: node.name,
            operator: node.operator,
        },
    };
}

function detectExposuresAlongRoute(
    route,
    monitoringCameraNodes = route.monitoring_camera_nodes,
) {
    const nodes = monitoringCameraNodes.map(normalizeMonitoringNodeForDetector);
    let detectorState = { cameras: {} };
    const exposures = [];

    route.coordinates.slice(1).forEach((coordinate, index) => {
        const result = processScorecardExposureSegment({
            currentLocation: makeLocation(coordinate, (index + 1) * 10000),
            detectorState,
            nodes,
            previousLocation: makeLocation(
                route.coordinates[index],
                index * 10000,
            ),
        });

        detectorState = result.detectorState;
        exposures.push(...result.exposures);
    });

    return exposures;
}

function detectExposuresAlongMaestroTravel(
    route,
    monitoringCameraNodes = route.monitoring_camera_nodes,
) {
    const nodes = monitoringCameraNodes.map(normalizeMonitoringNodeForDetector);
    let detectorState = { cameras: {} };
    let previousLocation = makeLocation(route.coordinates[0], 0);
    let recordedAt = 0;
    const exposures = [];

    route.coordinates.slice(1).forEach((endCoordinate) => {
        const startCoordinate = [
            previousLocation.longitude,
            previousLocation.latitude,
        ];
        const segmentDurationMs = Math.floor(
            (getMaestro1403TravelDistanceMeters(
                startCoordinate,
                endCoordinate,
            ) /
                MAESTRO_1403_DRIVE_SPEED) *
                1000,
        );
        const stepDurationMs = Math.floor(segmentDurationMs / 50);

        for (let step = 1; step <= 50; step += 1) {
            recordedAt += stepDurationMs;
            const currentLocation = makeLocation(
                [
                    startCoordinate[0] +
                        ((endCoordinate[0] - startCoordinate[0]) * step) / 50,
                    startCoordinate[1] +
                        ((endCoordinate[1] - startCoordinate[1]) * step) / 50,
                ],
                recordedAt,
            );
            const result = processScorecardExposureSegment({
                currentLocation,
                detectorState,
                nodes,
                previousLocation,
            });

            detectorState = result.detectorState;
            previousLocation = result.nextLocationAnchor;
            exposures.push(...result.exposures);
        }
    });

    return exposures;
}

function makeMaestro1403TravelLocations(
    route,
    {
        locationOverheadMs = MAESTRO_1403_LOCATION_OVERHEAD_MS,
        speed = MAESTRO_1403_DRIVE_SPEED,
    } = {},
) {
    let recordedAt = 0;
    const locations = [makeLocation(route.coordinates[0], recordedAt)];

    route.coordinates.slice(1).forEach((endCoordinate, index) => {
        const startCoordinate = route.coordinates[index];
        const segmentDurationMs = Math.floor(
            (getMaestro1403TravelDistanceMeters(
                startCoordinate,
                endCoordinate,
            ) /
                speed) *
                1000,
        );
        const stepDurationMs = Math.floor(
            segmentDurationMs / MAESTRO_1403_STEPS_PER_SEGMENT,
        );

        for (let step = 1; step <= MAESTRO_1403_STEPS_PER_SEGMENT; step += 1) {
            recordedAt += locationOverheadMs;
            locations.push(
                makeLocation(
                    [
                        startCoordinate[0] +
                            ((endCoordinate[0] - startCoordinate[0]) * step) /
                                MAESTRO_1403_STEPS_PER_SEGMENT,
                        startCoordinate[1] +
                            ((endCoordinate[1] - startCoordinate[1]) * step) /
                                MAESTRO_1403_STEPS_PER_SEGMENT,
                    ],
                    recordedAt,
                ),
            );
            recordedAt += stepDurationMs;
        }
    });

    return locations;
}

function sampleAndroidLocationDeliveries(locations, phaseMs = 0) {
    const deliveredLocations = [locations[0]];
    let nextDeliveryAt = ANDROID_LOCATION_DELIVERY_INTERVAL_MS + phaseMs;

    for (const location of locations.slice(1)) {
        if (location.recordedAt < nextDeliveryAt) {
            continue;
        }

        deliveredLocations.push(location);

        while (nextDeliveryAt <= location.recordedAt) {
            nextDeliveryAt += ANDROID_LOCATION_DELIVERY_INTERVAL_MS;
        }
    }

    const finalLocation = locations.at(-1);

    if (deliveredLocations.at(-1) !== finalLocation) {
        deliveredLocations.push(finalLocation);
    }

    return deliveredLocations;
}

function detectExposuresAlongAndroidMaestroTravel(
    route,
    monitoringCameraNodes = route.monitoring_camera_nodes,
    options = {},
) {
    const nodes = monitoringCameraNodes.map(normalizeMonitoringNodeForDetector);
    const locations = sampleAndroidLocationDeliveries(
        makeMaestro1403TravelLocations(route, options),
        options.phaseMs,
    );
    let detectorState = { cameras: {} };
    let previousLocation = locations[0];
    const exposures = [];

    for (const currentLocation of locations.slice(1)) {
        const result = processScorecardExposureSegment({
            currentLocation,
            detectorState,
            nodes,
            previousLocation,
        });

        detectorState = result.detectorState;
        previousLocation = result.nextLocationAnchor;
        exposures.push(...result.exposures);
    }

    return exposures;
}

afterEach(() => {
    setScorecardDriveE2EScenario(null);
});

describe('scorecard drive E2E route fixtures', () => {
    test('uses geometry-consistent backend-shaped route metadata', () => {
        for (const scenario of Object.values(SCORECARD_DRIVE_E2E_SCENARIOS)) {
            const fixture = getScorecardDriveE2EDirectionsFixture(scenario);

            assert.ok(fixture);
            assert.equal(fixture.avoidance_search_complete, true);
            assert.equal(
                fixture.fastest_route_node_count,
                fixture.routes.direct.camera_candidates.length,
            );

            for (const route of Object.values(fixture.routes)) {
                const measuredDistance =
                    getScorecardDriveE2ERouteDistanceMeters(route.coordinates);

                assert.ok(Math.abs(route.distance - measuredDistance) <= 0.05);
                assert.equal(route.camera_coverage_complete, true);
                assert.equal(route.node_count, route.camera_candidates.length);
                assert.equal(
                    route.scored_node_count,
                    route.camera_candidates.length,
                );
                assert.ok(Array.isArray(route.monitoring_camera_nodes));

                for (const candidate of route.camera_candidates) {
                    assert.equal(typeof candidate.osm_id, 'number');
                    assert.ok(Array.isArray(candidate.coordinate));
                    assert.equal(
                        candidate.direction_known,
                        candidate.directions.length > 0,
                    );
                    assert.ok(candidate.route_progress_fraction >= 0);
                    assert.ok(candidate.route_progress_fraction <= 1);
                    assert.ok(candidate.route_progress_meters >= 0);
                }

                for (const node of route.monitoring_camera_nodes) {
                    assert.equal(typeof node.osm_id, 'number');
                    assert.ok(Array.isArray(node.coordinate));
                    assert.equal(
                        node.direction_known,
                        node.directions.length > 0,
                    );
                    assert.equal(typeof node.name, 'string');
                    assert.equal(typeof node.operator, 'string');
                }
            }
        }
    });

    test('compensates for Maestro 1.40.3 travel distance conversion', () => {
        for (const scenario of Object.values(SCORECARD_DRIVE_E2E_SCENARIOS)) {
            const route =
                getScorecardDriveE2EDirectionsFixture(scenario).routes.ideal;

            route.coordinates.slice(1).forEach((coordinate, index) => {
                const previousCoordinate = route.coordinates[index];
                const trueDistance =
                    getScorecardDriveE2ECoordinateDistanceMeters(
                        previousCoordinate,
                        coordinate,
                    );
                const maestroDistance = getMaestro1403TravelDistanceMeters(
                    previousCoordinate,
                    coordinate,
                );
                const effectiveSpeed =
                    (trueDistance * MAESTRO_1403_DRIVE_SPEED) / maestroDistance;

                assert.ok(effectiveSpeed >= 9);
                assert.ok(effectiveSpeed <= 12);
            });
        }
    });

    test('prevents Android delivery gaps from creating false private-route reads', () => {
        const fixture = getScorecardDriveE2EDirectionsFixture(
            SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute,
        );
        const monitoringCameraNodes =
            fixture.routes.direct.monitoring_camera_nodes;
        const uncompensatedExposures = detectExposuresAlongAndroidMaestroTravel(
            fixture.routes.ideal,
            monitoringCameraNodes,
            { speed: 12 },
        );

        assert.deepEqual(
            uncompensatedExposures.map((exposure) => [
                exposure.osmId,
                exposure.certainty,
                Math.round(exposure.travelHeading),
            ]),
            [
                ['981001', 'confirmed', 257],
                ['981002', 'possible', 257],
            ],
        );

        for (const phaseMs of [0, 250, 500, 750]) {
            assert.deepEqual(
                detectExposuresAlongAndroidMaestroTravel(
                    fixture.routes.ideal,
                    monitoringCameraNodes,
                    {
                        phaseMs,
                        speed: MAESTRO_1403_DRIVE_SPEED,
                    },
                ),
                [],
            );
        }
    });

    test('preserves intended local exposures at compensated Android travel speed', () => {
        const fixture = getScorecardDriveE2EDirectionsFixture(
            SCORECARD_DRIVE_E2E_SCENARIOS.LocalExposure,
        );

        for (const phaseMs of [0, 250, 500, 750]) {
            const exposures = detectExposuresAlongAndroidMaestroTravel(
                fixture.routes.ideal,
                fixture.routes.ideal.monitoring_camera_nodes,
                {
                    phaseMs,
                    speed: MAESTRO_1403_DRIVE_SPEED,
                },
            );

            assert.deepEqual(
                exposures.map((exposure) => [
                    exposure.osmId,
                    exposure.certainty,
                ]),
                [
                    ['982001', 'confirmed'],
                    ['982002', 'possible'],
                ],
            );
            assert.ok(
                exposures.every((exposure) => exposure.osmId !== '982003'),
            );
        }
    });

    test('keeps the initial fastest cameras off the selected private route', () => {
        const fixture = getScorecardDriveE2EDirectionsFixture(
            SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute,
        );

        assert.deepEqual(
            fixture.routes.direct.camera_candidates.map(
                (candidate) => candidate.osm_id,
            ),
            [981001, 981002],
        );
        assert.deepEqual(fixture.routes.ideal.camera_candidates, []);
        assert.deepEqual(fixture.routes.ideal.monitoring_camera_nodes, []);
        assert.equal(fixture.routes.direct.monitoring_camera_nodes.length, 2);
        assert.deepEqual(
            detectExposuresAlongRoute(
                fixture.routes.ideal,
                fixture.routes.direct.monitoring_camera_nodes,
            ),
            [],
        );
        assert.deepEqual(
            detectExposuresAlongMaestroTravel(
                fixture.routes.ideal,
                fixture.routes.direct.monitoring_camera_nodes,
            ),
            [],
        );
    });

    test('logs one confirmed and one possible local crossing', () => {
        const fixture = getScorecardDriveE2EDirectionsFixture(
            SCORECARD_DRIVE_E2E_SCENARIOS.LocalExposure,
        );
        const directCandidateIds = fixture.routes.direct.camera_candidates.map(
            (candidate) => candidate.osm_id,
        );
        const idealCandidateIds = fixture.routes.ideal.camera_candidates.map(
            (candidate) => candidate.osm_id,
        );
        const exposures = detectExposuresAlongRoute(fixture.routes.ideal);

        assert.deepEqual(directCandidateIds, [982001, 982002]);
        assert.deepEqual(idealCandidateIds, directCandidateIds);
        assert.deepEqual(
            exposures.map((exposure) => [exposure.osmId, exposure.certainty]),
            [
                ['982001', 'confirmed'],
                ['982002', 'possible'],
            ],
        );
        assert.ok(exposures.every((exposure) => exposure.osmId !== '982003'));
    });

    test('publishes global cameras only for automotive free-drive coverage', () => {
        for (const scenario of [
            SCORECARD_DRIVE_E2E_SCENARIOS.LocalExposure,
            SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute,
        ]) {
            assert.deepEqual(
                getScorecardDriveE2EElectronicHorizonFixture(scenario),
                { coverageComplete: true, nodes: [] },
            );
        }

        const automotiveFixture = getScorecardDriveE2EElectronicHorizonFixture(
            SCORECARD_DRIVE_E2E_SCENARIOS.AutomotiveFreeExposure,
        );

        assert.equal(automotiveFixture.coverageComplete, true);
        assert.deepEqual(
            automotiveFixture.nodes.map((node) => [node.osmId, node.direction]),
            [
                [982001, '258'],
                [982002, null],
                [982003, '348'],
            ],
        );
        assert.equal(
            scorecardDriveE2ECameraInventoryIsReady(
                automotiveFixture.nodes,
                SCORECARD_DRIVE_E2E_SCENARIOS.AutomotiveFreeExposure,
            ),
            true,
        );
        assert.equal(
            scorecardDriveE2ECameraInventoryIsReady(
                [{ osmId: 982001 }],
                SCORECARD_DRIVE_E2E_SCENARIOS.AutomotiveFreeExposure,
            ),
            false,
        );
    });

    test('matches the road corridor to the selected route through its endpoint', () => {
        for (const scenario of Object.values(SCORECARD_DRIVE_E2E_SCENARIOS)) {
            const route =
                getScorecardDriveE2EDirectionsFixture(scenario).routes.ideal;
            const ways = getScorecardDriveE2ERoadCorridorWays(scenario);

            assert.equal(ways.length, 1);
            assert.deepEqual(ways[0].coordinates, route.coordinates);
            assert.deepEqual(
                ways[0].coordinates.at(-1),
                route.coordinates.at(-1),
            );
            assert.equal(ways[0].direction, 'forward');
        }
    });

    test('plumbs the URL-selected scenario into directions and global EH mocks', () => {
        const handlerSource = readFileSync(
            new URL('../../root/e2e-map-api-mock-handler.js', import.meta.url),
            'utf8',
        );
        const directionsMockSource = readFileSync(
            new URL('../api-mocks.js', import.meta.url),
            'utf8',
        );
        const electronicHorizonSource = readFileSync(
            new URL('../electronic-horizon-alerts-api.js', import.meta.url),
            'utf8',
        );

        assert.match(handlerSource, /setScorecardDriveE2EScenario/);
        assert.match(handlerSource, /scorecardDriveScenario/);
        assert.match(
            directionsMockSource,
            /getScorecardDriveE2EDirectionsFixture\(\)/,
        );
        assert.match(
            directionsMockSource,
            /getScorecardDriveE2ERoadCorridorWays\(\)/,
        );
        assert.match(
            electronicHorizonSource,
            /getScorecardDriveE2EElectronicHorizonFixture\(\)/,
        );
    });

    test('activates and clears only supported runtime scenarios', () => {
        setScorecardDriveE2EScenario(
            SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute,
        );
        assert.equal(
            getScorecardDriveE2EScenario(),
            SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute,
        );
        assert.ok(getScorecardDriveE2EDirectionsFixture());

        setScorecardDriveE2EScenario('unsupported');
        assert.equal(getScorecardDriveE2EScenario(), null);
        assert.equal(getScorecardDriveE2EDirectionsFixture(), null);
        assert.equal(getScorecardDriveE2EElectronicHorizonFixture(), null);
    });
});
