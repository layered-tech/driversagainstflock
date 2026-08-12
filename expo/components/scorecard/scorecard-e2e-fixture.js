import {
    createEmptyScorecardState,
    normalizeScorecardState,
    SCORECARD_FIXED_MPG,
    SCORECARD_LEVELS,
    unlockEarnedScorecardBadges,
} from './scorecard-engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const E2E_SCORECARD_LEVEL_FIXTURES = Object.freeze(
    SCORECARD_LEVELS.map(({ level }) => `level-${level}`),
);
const E2E_SCORECARD_FIXTURES = new Set([
    'arrival',
    'arrival-exposed',
    'badges-all',
    'coverage-incomplete',
    'populated',
    ...E2E_SCORECARD_LEVEL_FIXTURES,
]);
const E2E_SCORECARD_SCHEME = 'driversagainstflock:';
const E2E_SCORECARD_PATH = 'e2e-mocks';
const E2E_SCORECARD_ROUTE_PATH = 'scorecard';
const E2E_GAS_PRICE = 3.14;

export const E2E_SCORECARD_IDS = Object.freeze({
    arrivalTrip: 'drive-e2e-arrival',
    confirmedEast: 'read-e2e-confirmed-east',
    confirmedWest: 'read-e2e-confirmed-west',
    exposedTrip: 'drive-e2e-exposed',
    incompleteTrip: 'drive-e2e-incomplete',
    possible: 'read-e2e-possible',
});

function getDeepLinkPath(url) {
    return [url.hostname, url.pathname]
        .filter(Boolean)
        .join('')
        .replace(/^\/+/, '');
}

export function getE2EScorecardFixtureFromURL(value) {
    try {
        const url = new URL(value);
        const path = getDeepLinkPath(url);
        const fixture =
            path === E2E_SCORECARD_PATH
                ? url.searchParams.get('scorecard')
                : path === E2E_SCORECARD_ROUTE_PATH
                  ? url.searchParams.get('e2eScorecardFixture')
                  : null;

        return url.protocol === E2E_SCORECARD_SCHEME &&
            (path === E2E_SCORECARD_PATH ||
                path === E2E_SCORECARD_ROUTE_PATH) &&
            E2E_SCORECARD_FIXTURES.has(fixture)
            ? fixture
            : null;
    } catch {
        return null;
    }
}

function createAvoidedCameras(count, tripIndex, endedAt) {
    return Array.from({ length: count }, (_, index) => ({
        coordinate: [
            -97.75 + tripIndex * 0.002 + index * 0.0001,
            30.26 + tripIndex * 0.002 + index * 0.0001,
        ],
        earnedAt: endedAt - (count - index) * 30_000,
        osmId: `e2e-avoided-${tripIndex}-${index + 1}`,
    }));
}

function createTrip({
    avoidedCameraCount,
    endedAt,
    exposureCoverageComplete = true,
    exposureEventIds = [],
    extraMiles,
    gasPrice = E2E_GAS_PRICE,
    id,
    tripIndex,
}) {
    const extraGallons = extraMiles / SCORECARD_FIXED_MPG;
    const hasGasPrice = Number.isFinite(gasPrice);

    return {
        avoidedCameraCount,
        avoidedCameras: createAvoidedCameras(
            avoidedCameraCount,
            tripIndex,
            endedAt,
        ),
        completion: 'arrived',
        confirmedReadCount: exposureEventIds.filter((eventId) =>
            eventId.includes('confirmed'),
        ).length,
        distanceMiles: 12.4 + tripIndex * 2.1,
        durationSeconds: 2_100 + tripIndex * 180,
        endedAt,
        exposureCoverageComplete,
        exposureEventIds,
        extraFuelCost: hasGasPrice ? extraGallons * gasPrice : null,
        extraGallons,
        extraMiles,
        extraDurationSeconds: Math.round(extraMiles * 210),
        gasPrice: hasGasPrice ? gasPrice : null,
        gasPriceRetrievedAt: hasGasPrice
            ? new Date(endedAt - 45 * 60 * 1000).toISOString()
            : null,
        gasPriceSourceAsOf: hasGasPrice ? 'August 8, 2026' : null,
        id,
        mode: 'guided',
        possibleReadCount: exposureEventIds.filter((eventId) =>
            eventId.includes('possible'),
        ).length,
        startedAt: endedAt - (2_100 + tripIndex * 180) * 1000,
        startingStateCode: 'TX',
        xpEarned: avoidedCameraCount * 45,
    };
}

function createPopulatedScorecardFixture(now) {
    const arrivalEndedAt = now - 5 * 60 * 1000;
    const exposedEndedAt = now - DAY_MS - 40 * 60 * 1000;
    const cleanEndedAt = now - 2 * DAY_MS - 25 * 60 * 1000;
    const exposures = [
        {
            cameraCoordinate: [-97.7431, 30.2672],
            cameraDirectionLabel: 'W · 270°',
            cameraDirections: [{ end: 292.5, isRange: true, start: 247.5 }],
            certainty: 'confirmed',
            id: E2E_SCORECARD_IDS.confirmedWest,
            label: 'ALPR camera · OSM 91001',
            occurredAt: exposedEndedAt - 11 * 60 * 1000,
            operator: 'Flock Safety',
            osmId: '91001',
            routeSegmentCoordinates: [
                [-97.7482, 30.2671],
                [-97.7431, 30.2672],
                [-97.7385, 30.2694],
            ],
            sessionId: 'drive-e2e-exposed',
            travelHeading: 270,
        },
        {
            cameraCoordinate: [-97.7318, 30.2736],
            cameraDirectionLabel: 'N · 0°',
            cameraDirections: [{ end: 22.5, isRange: true, start: -22.5 }],
            certainty: 'confirmed',
            id: E2E_SCORECARD_IDS.confirmedEast,
            label: 'ALPR camera · OSM 91002',
            occurredAt: exposedEndedAt - 7 * 60 * 1000,
            operator: null,
            osmId: '91002',
            routeSegmentCoordinates: [
                [-97.7364, 30.2708],
                [-97.7318, 30.2736],
                [-97.7279, 30.2771],
            ],
            sessionId: 'drive-e2e-exposed',
            travelHeading: 3,
        },
        {
            cameraCoordinate: [-97.7244, 30.2812],
            cameraDirectionLabel: null,
            cameraDirections: [],
            certainty: 'possible',
            id: E2E_SCORECARD_IDS.possible,
            label: 'ALPR camera · OSM 91003',
            occurredAt: exposedEndedAt - 3 * 60 * 1000,
            operator: null,
            osmId: '91003',
            routeSegmentCoordinates: [
                [-97.7279, 30.2771],
                [-97.7244, 30.2812],
                [-97.7212, 30.2846],
            ],
            sessionId: 'drive-e2e-exposed',
            travelHeading: 38,
        },
    ];
    const trips = [
        createTrip({
            avoidedCameraCount: 7,
            endedAt: cleanEndedAt,
            extraMiles: 1.4,
            id: 'drive-e2e-clean',
            tripIndex: 1,
        }),
        createTrip({
            avoidedCameraCount: 12,
            endedAt: exposedEndedAt,
            exposureEventIds: exposures.map(({ id }) => id),
            extraMiles: 2.1,
            id: E2E_SCORECARD_IDS.exposedTrip,
            tripIndex: 2,
        }),
        createTrip({
            avoidedCameraCount: 8,
            endedAt: arrivalEndedAt,
            extraMiles: 3.2,
            id: E2E_SCORECARD_IDS.arrivalTrip,
            tripIndex: 3,
        }),
    ];
    const state = normalizeScorecardState(
        {
            ...createEmptyScorecardState(),
            badgeUnlocks: {
                cartographer: now - 45 * DAY_MS,
                'clean-week': now - 20 * DAY_MS,
                'first-detour': now - 90 * DAY_MS,
                ghost: now - 10 * DAY_MS,
            },
            exposures,
            lifetime: {
                avoidedCameraCount: 56,
                cleanDriveCount: 16,
                completedDriveCount: 21,
                confirmedReadCount: 7,
                contributedCameraCount: 12,
                currentCleanDriveStreak: 1,
                extraFuelCost: 4.58,
                extraGallons: 1.43,
                extraMiles: 36.1,
                longestCleanDriveStreak: 7,
                possibleReadCount: 3,
                privateTripsWithAvoidance: 19,
                xp: 2520,
            },
            trips,
        },
        now,
    );

    return state;
}

function createIncompleteCoverageFixture(populatedState, now) {
    const incompleteTrip = createTrip({
        avoidedCameraCount: 4,
        endedAt: now - 3 * 60 * 1000,
        exposureCoverageComplete: false,
        extraMiles: 1.8,
        gasPrice: null,
        id: E2E_SCORECARD_IDS.incompleteTrip,
        tripIndex: 4,
    });
    const state = normalizeScorecardState(
        {
            ...populatedState,
            trips: [
                ...populatedState.trips.filter(
                    ({ id }) => id !== E2E_SCORECARD_IDS.arrivalTrip,
                ),
                incompleteTrip,
            ],
        },
        now,
    );

    return {
        pendingRecap: state.trips.find(
            ({ id }) => id === E2E_SCORECARD_IDS.incompleteTrip,
        ),
        state,
    };
}

function createAllBadgesFixture(now) {
    const dayOffsets = [29, 20, 7, 6, 5, 4, 3, 2, 1, 0];
    const trips = dayOffsets.map((dayOffset, index) =>
        createTrip({
            avoidedCameraCount: 10,
            endedAt: now - dayOffset * DAY_MS - 5 * 60 * 1000,
            extraMiles: 0.4,
            id: `drive-e2e-badges-${index + 1}`,
            tripIndex: index + 20,
        }),
    );
    const extraFuelCost = trips.reduce(
        (total, trip) => total + trip.extraFuelCost,
        0,
    );
    const extraGallons = trips.reduce(
        (total, trip) => total + trip.extraGallons,
        0,
    );
    const extraMiles = trips.reduce(
        (total, trip) => total + trip.extraMiles,
        0,
    );
    const state = normalizeScorecardState(
        {
            ...createEmptyScorecardState(),
            lifetime: {
                avoidedCameraCount: 100,
                cleanDriveCount: 10,
                completedDriveCount: 10,
                confirmedReadCount: 0,
                contributedCameraCount: 10,
                currentCleanDriveStreak: 8,
                extraFuelCost,
                extraGallons,
                extraMiles,
                longestCleanDriveStreak: 8,
                possibleReadCount: 0,
                privateTripsWithAvoidance: 10,
                xp: 4500,
            },
            trips,
        },
        now,
    );

    return {
        pendingRecap: null,
        state: unlockEarnedScorecardBadges(state, now),
    };
}

function createLevelFixture(fixtureName, now) {
    const levelNumber = Number(fixtureName.replace('level-', ''));
    const level = SCORECARD_LEVELS.find(
        (candidate) => candidate.level === levelNumber,
    );
    const state = normalizeScorecardState(
        {
            ...createEmptyScorecardState(),
            lifetime: {
                ...createEmptyScorecardState().lifetime,
                xp: level.threshold,
            },
        },
        now,
    );

    return {
        pendingRecap: null,
        state: unlockEarnedScorecardBadges(state, now),
    };
}

export function createE2EScorecardFixture(
    fixtureName = 'populated',
    now = Date.now(),
) {
    if (!E2E_SCORECARD_FIXTURES.has(fixtureName)) {
        throw new Error(`Unknown scorecard E2E fixture: ${fixtureName}`);
    }

    if (fixtureName === 'badges-all') {
        return createAllBadgesFixture(now);
    }

    if (E2E_SCORECARD_LEVEL_FIXTURES.includes(fixtureName)) {
        return createLevelFixture(fixtureName, now);
    }

    const state = createPopulatedScorecardFixture(now);

    if (fixtureName === 'coverage-incomplete') {
        return createIncompleteCoverageFixture(state, now);
    }

    const pendingTripId =
        fixtureName === 'arrival'
            ? E2E_SCORECARD_IDS.arrivalTrip
            : fixtureName === 'arrival-exposed'
              ? E2E_SCORECARD_IDS.exposedTrip
              : null;

    return {
        pendingRecap: pendingTripId
            ? state.trips.find(({ id }) => id === pendingTripId)
            : null,
        state,
    };
}
