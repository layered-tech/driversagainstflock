export const SCORECARD_DRIVE_E2E_SCENARIOS = Object.freeze({
    LocalExposure: 'local-exposure',
    PrivateRoute: 'private-route',
});

export const SCORECARD_DRIVE_E2E_START_COORDINATE = Object.freeze([
    -97.7431, 30.2672,
]);
export const SCORECARD_DRIVE_E2E_END_COORDINATE = Object.freeze([
    -97.7518, 30.2654,
]);

const EARTH_RADIUS_METERS = 6371008.8;
const SCORECARD_DRIVE_E2E_SCENARIO_VALUES = new Set(
    Object.values(SCORECARD_DRIVE_E2E_SCENARIOS),
);

let runtimeScorecardDriveE2EScenario = null;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

export function getScorecardDriveE2ECoordinateDistanceMeters(
    fromCoordinate,
    toCoordinate,
) {
    const [fromLongitude, fromLatitude] = fromCoordinate;
    const [toLongitude, toLatitude] = toCoordinate;
    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
    const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.sin(longitudeDelta / 2) ** 2;
    const clampedHaversine = Math.min(1, Math.max(0, haversine));

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(clampedHaversine), Math.sqrt(1 - clampedHaversine))
    );
}

export function getScorecardDriveE2ERouteDistanceMeters(coordinates) {
    return coordinates
        .slice(1)
        .reduce(
            (distanceMeters, coordinate, index) =>
                distanceMeters +
                getScorecardDriveE2ECoordinateDistanceMeters(
                    coordinates[index],
                    coordinate,
                ),
            0,
        );
}

function roundedDistance(coordinates) {
    return (
        Math.round(getScorecardDriveE2ERouteDistanceMeters(coordinates) * 10) /
        10
    );
}

function makeDirectionsManeuver({
    coordinates,
    distance,
    duration,
    instruction,
    name = '',
    type,
    wayPoints,
}) {
    return {
        distance,
        duration,
        instruction,
        maneuver: { location: coordinates[wayPoints[0]] },
        name,
        type,
        way_points: wayPoints,
    };
}

function makeRoute({
    cameraCandidates,
    coordinates,
    duration,
    maneuvers,
    monitoringCameraNodes,
}) {
    return {
        camera_candidates: cameraCandidates,
        camera_coverage_complete: true,
        coordinates,
        distance: roundedDistance(coordinates),
        duration,
        maneuvers,
        monitoring_camera_nodes: monitoringCameraNodes,
        node_count: cameraCandidates.length,
        scored_node_count: cameraCandidates.length,
    };
}

function makeCameraCandidate({
    coordinate,
    directions,
    osmId,
    routeDistanceMeters,
    routeProgressMeters,
}) {
    return {
        coordinate,
        direction_known: directions.length > 0,
        directions,
        osm_id: osmId,
        route_progress_fraction: Number(
            (routeProgressMeters / routeDistanceMeters).toFixed(6),
        ),
        route_progress_meters: Number(routeProgressMeters.toFixed(1)),
    };
}

function makeMonitoringCameraNode({
    coordinate,
    directions,
    name,
    operator,
    osmId,
}) {
    return {
        coordinate,
        direction_known: directions.length > 0,
        directions,
        name,
        operator,
        osm_id: osmId,
    };
}

function makeDirectionsResult(direct, ideal) {
    return {
        avoidance_search_complete: true,
        fastest_route_node_count: direct.camera_candidates.length,
        routes: { direct, ideal },
    };
}

function makePrivateRouteFixture() {
    const start = [...SCORECARD_DRIVE_E2E_START_COORDINATE];
    const end = [...SCORECARD_DRIVE_E2E_END_COORDINATE];
    const directCoordinates = [start, [-97.74745, 30.2663], end];
    const idealCoordinates = [
        start,
        [-97.74484, 30.26884],
        [-97.749625, 30.26785],
        [-97.75115, 30.26585],
        [-97.75158, 30.26555],
        end,
    ];
    const directDistance = roundedDistance(directCoordinates);
    const idealDistance = roundedDistance(idealCoordinates);
    const knownDirections = [{ end: 258, is_range: false, start: 258 }];
    const knownCoordinate = [-97.74658, 30.26648];
    const unknownCoordinate = [-97.748755, 30.26603];
    const monitoringCameraNodes = [
        makeMonitoringCameraNode({
            coordinate: knownCoordinate,
            directions: knownDirections,
            name: 'Fastest route directional ALPR',
            operator: 'E2E public camera inventory',
            osmId: 981001,
        }),
        makeMonitoringCameraNode({
            coordinate: unknownCoordinate,
            directions: [],
            name: 'Fastest route unknown-direction ALPR',
            operator: 'E2E public camera inventory',
            osmId: 981002,
        }),
    ];
    const directCandidates = [
        makeCameraCandidate({
            coordinate: knownCoordinate,
            directions: knownDirections,
            osmId: 981001,
            routeDistanceMeters: directDistance,
            routeProgressMeters: directDistance * 0.4,
        }),
        makeCameraCandidate({
            coordinate: unknownCoordinate,
            directions: [],
            osmId: 981002,
            routeDistanceMeters: directDistance,
            routeProgressMeters: directDistance * 0.65,
        }),
    ];
    const directDuration = 78;
    const idealDuration = 112;
    const direct = makeRoute({
        cameraCandidates: directCandidates,
        coordinates: directCoordinates,
        duration: directDuration,
        maneuvers: [
            makeDirectionsManeuver({
                coordinates: directCoordinates,
                distance: directDistance,
                duration: directDuration,
                instruction: 'Continue southwest on the fastest route',
                name: 'Fastest route',
                type: 11,
                wayPoints: [0, directCoordinates.length - 1],
            }),
        ],
        monitoringCameraNodes,
    });
    const ideal = makeRoute({
        cameraCandidates: [],
        coordinates: idealCoordinates,
        duration: idealDuration,
        maneuvers: [
            makeDirectionsManeuver({
                coordinates: idealCoordinates,
                distance: idealDistance,
                duration: 34,
                instruction: 'Keep right to take the private route',
                name: 'Private route',
                type: 11,
                wayPoints: [0, 1],
            }),
            makeDirectionsManeuver({
                coordinates: idealCoordinates,
                distance: idealDistance,
                duration: 66,
                instruction: 'Continue around the monitored corridor',
                name: 'Private route',
                type: 6,
                wayPoints: [1, idealCoordinates.length - 2],
            }),
            makeDirectionsManeuver({
                coordinates: idealCoordinates,
                distance: 25,
                duration: 12,
                instruction: 'Arrive at your destination',
                type: 10,
                wayPoints: [
                    idealCoordinates.length - 2,
                    idealCoordinates.length - 1,
                ],
            }),
        ],
        monitoringCameraNodes: [],
    });

    return makeDirectionsResult(direct, ideal);
}

function makeLocalExposureFixture() {
    const start = [...SCORECARD_DRIVE_E2E_START_COORDINATE];
    const end = [...SCORECARD_DRIVE_E2E_END_COORDINATE];
    const directCoordinates = [
        start,
        [-97.746145, 30.26657],
        [-97.74832, 30.26612],
        end,
    ];
    const idealCoordinates = [
        start,
        [-97.74484, 30.26684],
        [-97.746145, 30.26657],
        [-97.74832, 30.26612],
        [-97.74978, 30.26471],
        [-97.75115, 30.26585],
        [-97.75158, 30.26555],
        end,
    ];
    const directDistance = roundedDistance(directCoordinates);
    const idealDistance = roundedDistance(idealCoordinates);
    const knownDirections = [{ end: 258, is_range: false, start: 258 }];
    const negativeControlDirections = [
        { end: 348, is_range: false, start: 348 },
    ];
    const knownCoordinate = [-97.745536, 30.266696];
    const unknownCoordinate = [-97.747624, 30.266264];
    const negativeControlCoordinate = [-97.749086, 30.266239];
    const monitoringCameraNodes = [
        makeMonitoringCameraNode({
            coordinate: knownCoordinate,
            directions: knownDirections,
            name: 'Directional cone crossing',
            operator: 'E2E public camera inventory',
            osmId: 982001,
        }),
        makeMonitoringCameraNode({
            coordinate: unknownCoordinate,
            directions: [],
            name: 'Unknown-direction crossing',
            operator: 'E2E public camera inventory',
            osmId: 982002,
        }),
        makeMonitoringCameraNode({
            coordinate: negativeControlCoordinate,
            directions: negativeControlDirections,
            name: 'Behind-cone negative control',
            operator: 'E2E public camera inventory',
            osmId: 982003,
        }),
    ];
    const sharedCandidateDefinitions = [
        {
            coordinate: knownCoordinate,
            directions: knownDirections,
            fraction: 0.28,
            osmId: 982001,
        },
        {
            coordinate: unknownCoordinate,
            directions: [],
            fraction: 0.52,
            osmId: 982002,
        },
    ];
    const directCandidates = sharedCandidateDefinitions.map((candidate) =>
        makeCameraCandidate({
            ...candidate,
            routeDistanceMeters: directDistance,
            routeProgressMeters: directDistance * candidate.fraction,
        }),
    );
    const idealCandidates = sharedCandidateDefinitions.map((candidate) =>
        makeCameraCandidate({
            ...candidate,
            routeDistanceMeters: idealDistance,
            routeProgressMeters: directDistance * candidate.fraction,
        }),
    );
    const directDuration = 78;
    const idealDuration = 105;
    const direct = makeRoute({
        cameraCandidates: directCandidates,
        coordinates: directCoordinates,
        duration: directDuration,
        maneuvers: [
            makeDirectionsManeuver({
                coordinates: directCoordinates,
                distance: directDistance,
                duration: directDuration,
                instruction: 'Continue southwest on the fastest route',
                name: 'Fastest route',
                type: 11,
                wayPoints: [0, directCoordinates.length - 1],
            }),
        ],
        monitoringCameraNodes,
    });
    const ideal = makeRoute({
        cameraCandidates: idealCandidates,
        coordinates: idealCoordinates,
        duration: idealDuration,
        maneuvers: [
            makeDirectionsManeuver({
                coordinates: idealCoordinates,
                distance: idealDistance,
                duration: 68,
                instruction: 'Continue southwest on the private route',
                name: 'Private route',
                type: 11,
                wayPoints: [0, 3],
            }),
            makeDirectionsManeuver({
                coordinates: idealCoordinates,
                distance: idealDistance,
                duration: 25,
                instruction: 'Keep right toward your destination',
                name: 'Private route',
                type: 1,
                wayPoints: [3, idealCoordinates.length - 2],
            }),
            makeDirectionsManeuver({
                coordinates: idealCoordinates,
                distance: 25,
                duration: 12,
                instruction: 'Arrive at your destination',
                type: 10,
                wayPoints: [
                    idealCoordinates.length - 2,
                    idealCoordinates.length - 1,
                ],
            }),
        ],
        monitoringCameraNodes,
    });

    return makeDirectionsResult(direct, ideal);
}

export function scorecardDriveE2EScenarioIsSupported(value) {
    return SCORECARD_DRIVE_E2E_SCENARIO_VALUES.has(value);
}

export function getScorecardDriveE2EScenario() {
    return runtimeScorecardDriveE2EScenario;
}

export function setScorecardDriveE2EScenario(value) {
    runtimeScorecardDriveE2EScenario = scorecardDriveE2EScenarioIsSupported(
        value,
    )
        ? value
        : null;
}

export function getScorecardDriveE2EDirectionsFixture(
    scenario = runtimeScorecardDriveE2EScenario,
) {
    if (scenario === SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute) {
        return makePrivateRouteFixture();
    }

    if (scenario === SCORECARD_DRIVE_E2E_SCENARIOS.LocalExposure) {
        return makeLocalExposureFixture();
    }

    return null;
}

export function getScorecardDriveE2EElectronicHorizonFixture(
    scenario = runtimeScorecardDriveE2EScenario,
) {
    return scorecardDriveE2EScenarioIsSupported(scenario)
        ? { coverageComplete: true, nodes: [] }
        : null;
}

export function getScorecardDriveE2ERoadCorridorWays(
    scenario = runtimeScorecardDriveE2EScenario,
) {
    const fixture = getScorecardDriveE2EDirectionsFixture(scenario);
    const coordinates = fixture?.routes?.ideal?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return [];
    }

    return [
        {
            coordinates: coordinates.map((coordinate) => [...coordinate]),
            direction: 'forward',
            id: `e2e-scorecard-${scenario}`,
            name: 'Private route',
            nodeIds: coordinates.map(
                (_, index) => `scorecard-${scenario}-${index}`,
            ),
            osmWayId:
                scenario === SCORECARD_DRIVE_E2E_SCENARIOS.PrivateRoute
                    ? 981000
                    : 982000,
            priority: 7,
            roadClass: 'primary',
            speedLimit: { speed: 25, speedLimitMph: 25, unit: 'mph' },
        },
    ];
}
