import { normalizeScorecardExposureRouteSegment } from './scorecard-exposure-route.js';

export const SCORECARD_STATS_WINDOW_DAYS = 30;
export const SCORECARD_STATS_WINDOW_MS =
    SCORECARD_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const SCORECARD_FIXED_MPG = 25.2;
export const SCORECARD_STORAGE_VERSION = 1;
export const SCORECARD_XP_PER_AVOIDED_CAMERA = 45;

export const SCORECARD_LEVELS = Object.freeze([
    { level: 1, name: 'Scout', threshold: 0 },
    { level: 2, name: 'Rerouter', threshold: 450 },
    { level: 3, name: 'Shadow', threshold: 1350 },
    { level: 4, name: 'Ghost', threshold: 2250 },
    { level: 5, name: 'Phantom', threshold: 3000 },
    { level: 6, name: 'Specter', threshold: 4500 },
    { level: 7, name: 'Cipher', threshold: 6750 },
    { level: 8, name: 'Invisible', threshold: 9000 },
]);

export const SCORECARD_BADGES = Object.freeze([
    {
        caption: 'Complete a private route that avoids a camera',
        icon: 'navigation',
        id: 'first-detour',
        name: 'First detour',
    },
    {
        caption: 'Complete 7 consecutive drives with zero reads',
        icon: 'shield-check',
        id: 'clean-week',
        name: 'Clean streak',
    },
    {
        caption: 'Avoid 100 cameras',
        icon: 'star',
        id: 'century',
        name: 'Century',
    },
    {
        caption: 'Reach Level 4',
        icon: 'ghost',
        id: 'ghost',
        name: 'Ghost',
    },
    {
        caption: 'Finish 10 drives across 30 days with zero reads',
        icon: 'moon',
        id: 'zero-month',
        name: 'Zero month',
    },
    {
        caption: 'Publish 10 new cameras to the map',
        icon: 'pencil',
        id: 'cartographer',
        name: 'Cartographer',
    },
]);

function finiteNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
    return Math.max(0, finiteNumber(value, fallback));
}

function optionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

function normalizeFuelEconomyMpg(value) {
    const mpg = Number(value);

    return Number.isFinite(mpg) && mpg >= 1 && mpg <= 200 ? mpg : null;
}

function normalizeGasPricePerGallon(value) {
    const gasPrice = Number(value);

    return Number.isFinite(gasPrice) && gasPrice > 0 && gasPrice < 20
        ? gasPrice
        : null;
}

export function getScorecardFuelCostSettings(settings) {
    return {
        fuelEconomyMpg:
            normalizeFuelEconomyMpg(settings?.fuelEconomyMpg) ??
            SCORECARD_FIXED_MPG,
        gasPricePerGallon: normalizeGasPricePerGallon(
            settings?.gasPricePerGallon,
        ),
    };
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCoordinate(value) {
    const longitude = Number(value?.[0]);
    const latitude = Number(value?.[1]);

    return Number.isFinite(longitude) &&
        Number.isFinite(latitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude >= -90 &&
        latitude <= 90
        ? [longitude, latitude]
        : null;
}

function normalizeOptionalText(value, maximumLength = 160) {
    return typeof value === 'string' && value.trim()
        ? value.trim().slice(0, maximumLength)
        : null;
}

function normalizeCameraDirections(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((direction) => {
        const start = finiteNumber(direction?.start, Number.NaN);
        const end = finiteNumber(direction?.end, Number.NaN);

        return Number.isFinite(start) && Number.isFinite(end)
            ? [
                  {
                      end,
                      isRange:
                          direction?.isRange === true ||
                          direction?.is_range === true,
                      start,
                  },
              ]
            : [];
    });
}

function normalizeSparseCameraRecord(value) {
    const coordinate = normalizeCoordinate(
        value?.cameraCoordinate ?? value?.coordinate,
    );
    const osmId = value?.osmId;

    if (
        !coordinate ||
        (typeof osmId !== 'string' && typeof osmId !== 'number')
    ) {
        return null;
    }

    return {
        coordinate,
        earnedAt: finiteNumber(value?.earnedAt, 0),
        osmId: String(osmId),
    };
}

function normalizeActiveSession(value) {
    const id = normalizeOptionalText(value?.id, 100);
    const startedAt = finiteNumber(value?.startedAt, 0);

    if (!id || startedAt <= 0) {
        return null;
    }

    const completedDistanceMeters = nonNegativeNumber(
        value?.completedDistanceMeters,
    );
    const completedExtraDistanceMeters = nonNegativeNumber(
        value?.completedExtraDistanceMeters,
    );
    const completedExtraDurationSeconds = nonNegativeNumber(
        value?.completedExtraDurationSeconds,
    );

    return {
        completedDistanceMeters,
        completedExtraDistanceMeters,
        completedExtraDurationSeconds,
        creditedAvoidances: Array.isArray(value?.creditedAvoidances)
            ? value.creditedAvoidances
                  .map(normalizeSparseCameraRecord)
                  .filter(Boolean)
            : [],
        gasPrice: Number.isFinite(value?.gasPrice) ? value.gasPrice : null,
        gasPriceRetrievedAt: normalizeOptionalText(
            value?.gasPriceRetrievedAt,
            50,
        ),
        gasPriceSourceAsOf: normalizeOptionalText(
            value?.gasPriceSourceAsOf,
            50,
        ),
        fuelEconomyMpg:
            normalizeFuelEconomyMpg(value?.fuelEconomyMpg) ??
            SCORECARD_FIXED_MPG,
        exposureCoverageObserved: value?.exposureCoverageObserved === true,
        exposureCoveragePending: value?.exposureCoveragePending !== false,
        exposureCoverageWasTruncated:
            value?.exposureCoverageWasTruncated === true,
        id,
        mode: value?.mode === 'guided' ? 'guided' : 'free',
        startedAt,
        startingStateCode: /^[A-Z]{2}$/.test(value?.startingStateCode ?? '')
            ? value.startingStateCode
            : null,
    };
}

function normalizeExposure(value) {
    const cameraCoordinate = normalizeCoordinate(value?.cameraCoordinate);
    const certainty =
        value?.certainty === 'confirmed'
            ? 'confirmed'
            : value?.certainty === 'possible'
              ? 'possible'
              : null;
    const id = normalizeOptionalText(value?.id, 100);
    const occurredAt = finiteNumber(value?.occurredAt, 0);
    const osmId = value?.osmId;
    const sessionId = normalizeOptionalText(value?.sessionId, 100);

    if (
        !cameraCoordinate ||
        !certainty ||
        !id ||
        occurredAt <= 0 ||
        (typeof osmId !== 'string' && typeof osmId !== 'number') ||
        !sessionId
    ) {
        return null;
    }

    return {
        cameraCoordinate,
        cameraDirectionLabel: normalizeOptionalText(
            value?.cameraDirectionLabel,
            100,
        ),
        cameraDirections: normalizeCameraDirections(value?.cameraDirections),
        certainty,
        id,
        label:
            normalizeOptionalText(value?.label, 160) ??
            `ALPR camera · OSM ${osmId}`,
        occurredAt,
        operator: normalizeOptionalText(value?.operator, 120),
        osmId: String(osmId),
        routeSegmentCoordinates: normalizeScorecardExposureRouteSegment(
            value?.routeSegmentCoordinates,
        ),
        sessionId,
        travelHeading: Number.isFinite(value?.travelHeading)
            ? value.travelHeading
            : null,
    };
}

function normalizeTrip(value) {
    const id = normalizeOptionalText(value?.id, 100);
    const endedAt = finiteNumber(value?.endedAt, 0);
    const startedAt = finiteNumber(value?.startedAt, 0);

    if (!id || endedAt <= 0 || startedAt <= 0) {
        return null;
    }

    return {
        avoidedCameraCount: nonNegativeNumber(value?.avoidedCameraCount),
        avoidedCameras: Array.isArray(value?.avoidedCameras)
            ? value.avoidedCameras
                  .map(normalizeSparseCameraRecord)
                  .filter(Boolean)
            : [],
        completion: normalizeOptionalText(value?.completion, 30) ?? 'manual',
        confirmedReadCount: nonNegativeNumber(value?.confirmedReadCount),
        distanceMiles: nonNegativeNumber(value?.distanceMiles),
        durationSeconds: nonNegativeNumber(value?.durationSeconds),
        endedAt,
        exposureEventIds: Array.isArray(value?.exposureEventIds)
            ? value.exposureEventIds
                  .map((eventId) => normalizeOptionalText(eventId, 100))
                  .filter(Boolean)
            : [],
        exposureCoverageComplete: value?.exposureCoverageComplete === true,
        exposureCoverageObserved: optionalBoolean(
            value?.exposureCoverageObserved,
        ),
        exposureCoveragePending: optionalBoolean(
            value?.exposureCoveragePending,
        ),
        exposureCoverageWasTruncated: optionalBoolean(
            value?.exposureCoverageWasTruncated,
        ),
        extraFuelCost: Number.isFinite(value?.extraFuelCost)
            ? nonNegativeNumber(value.extraFuelCost)
            : null,
        extraGallons: nonNegativeNumber(value?.extraGallons),
        extraMiles: nonNegativeNumber(value?.extraMiles),
        extraDurationSeconds: nonNegativeNumber(value?.extraDurationSeconds),
        gasPrice: Number.isFinite(value?.gasPrice)
            ? nonNegativeNumber(value.gasPrice)
            : null,
        gasPriceRetrievedAt: normalizeOptionalText(
            value?.gasPriceRetrievedAt,
            50,
        ),
        gasPriceSourceAsOf: normalizeOptionalText(
            value?.gasPriceSourceAsOf,
            50,
        ),
        fuelEconomyMpg:
            normalizeFuelEconomyMpg(value?.fuelEconomyMpg) ??
            SCORECARD_FIXED_MPG,
        id,
        localDay: /^\d{4}-\d{2}-\d{2}$/.test(value?.localDay ?? '')
            ? value.localDay
            : getLocalCalendarDay(endedAt),
        mode: value?.mode === 'guided' ? 'guided' : 'free',
        possibleReadCount: nonNegativeNumber(value?.possibleReadCount),
        startedAt,
        startingStateCode: /^[A-Z]{2}$/.test(value?.startingStateCode ?? '')
            ? value.startingStateCode
            : null,
        xpEarned: nonNegativeNumber(value?.xpEarned),
    };
}

export function createEmptyScorecardState() {
    return {
        activeSession: null,
        badgeUnlocks: {},
        exposures: [],
        lifetime: {
            avoidedCameraCount: 0,
            cleanDriveCount: 0,
            completedDriveCount: 0,
            confirmedReadCount: 0,
            contributedCameraCount: 0,
            currentCleanDriveStreak: 0,
            extraFuelCost: 0,
            extraGallons: 0,
            extraMiles: 0,
            longestCleanDriveStreak: 0,
            possibleReadCount: 0,
            privateTripsWithAvoidance: 0,
            xp: 0,
        },
        pendingRecapTripId: null,
        settings: {
            enabled: true,
            fuelEconomyMpg: null,
            gasPricePerGallon: null,
        },
        trips: [],
        version: SCORECARD_STORAGE_VERSION,
    };
}

function normalizeLifetime(lifetime) {
    const emptyLifetime = createEmptyScorecardState().lifetime;

    return Object.fromEntries(
        Object.keys(emptyLifetime).map((key) => [
            key,
            nonNegativeNumber(lifetime?.[key]),
        ]),
    );
}

function normalizeBadgeUnlocks(badgeUnlocks) {
    if (!isRecord(badgeUnlocks)) {
        return {};
    }

    const knownBadgeIds = new Set(SCORECARD_BADGES.map((badge) => badge.id));

    return Object.fromEntries(
        Object.entries(badgeUnlocks).filter(
            ([badgeId, unlockedAt]) =>
                knownBadgeIds.has(badgeId) && Number.isFinite(unlockedAt),
        ),
    );
}

export function getScorecardStatsWindowState(state, now = Date.now()) {
    const cutoff = now - SCORECARD_STATS_WINDOW_MS;

    return {
        ...state,
        exposures: state.exposures.filter(
            (event) => finiteNumber(event?.occurredAt, 0) >= cutoff,
        ),
        trips: state.trips.filter(
            (trip) => finiteNumber(trip?.endedAt, 0) >= cutoff,
        ),
    };
}

export function normalizeScorecardState(value) {
    if (!isRecord(value) || value.version !== SCORECARD_STORAGE_VERSION) {
        return createEmptyScorecardState();
    }

    const trips = Array.isArray(value.trips)
        ? value.trips.map(normalizeTrip).filter(Boolean)
        : [];
    const requestedPendingRecapTripId = normalizeOptionalText(
        value.pendingRecapTripId,
        100,
    );

    return {
        activeSession: normalizeActiveSession(value.activeSession),
        badgeUnlocks: normalizeBadgeUnlocks(value.badgeUnlocks),
        exposures: Array.isArray(value.exposures)
            ? value.exposures.map(normalizeExposure).filter(Boolean)
            : [],
        lifetime: normalizeLifetime(value.lifetime),
        pendingRecapTripId: trips.some(
            (trip) => trip.id === requestedPendingRecapTripId,
        )
            ? requestedPendingRecapTripId
            : null,
        settings: {
            enabled: value.settings?.enabled !== false,
            fuelEconomyMpg: normalizeFuelEconomyMpg(
                value.settings?.fuelEconomyMpg,
            ),
            gasPricePerGallon: normalizeGasPricePerGallon(
                value.settings?.gasPricePerGallon,
            ),
        },
        trips,
        version: SCORECARD_STORAGE_VERSION,
    };
}

export function parseScorecardState(serializedState, now = Date.now()) {
    if (typeof serializedState !== 'string' || !serializedState) {
        return createEmptyScorecardState();
    }

    try {
        return normalizeScorecardState(JSON.parse(serializedState), now);
    } catch {
        return createEmptyScorecardState();
    }
}

export function serializeScorecardState(state, now = Date.now()) {
    try {
        return JSON.stringify(normalizeScorecardState(state, now));
    } catch {
        return null;
    }
}

export function createLocalScorecardId(prefix, now = Date.now()) {
    const randomId = globalThis.crypto?.randomUUID?.();

    if (randomId) {
        return `${prefix}-${randomId}`;
    }

    return `${prefix}-${now.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 12)}`;
}

export function getScorecardPrivacyScore(avoidedCount, confirmedReadCount) {
    const avoided = nonNegativeNumber(avoidedCount);
    const confirmedReads = nonNegativeNumber(confirmedReadCount);
    const denominator = avoided + 1.5 * confirmedReads;

    return denominator > 0 ? Math.round((100 * avoided) / denominator) : null;
}

export function getScorecardLevel(xp) {
    const resolvedXp = nonNegativeNumber(xp);
    let currentLevel = SCORECARD_LEVELS[0];

    for (const level of SCORECARD_LEVELS) {
        if (resolvedXp >= level.threshold) {
            currentLevel = level;
        }
    }

    const nextLevel =
        SCORECARD_LEVELS.find(
            (level) => level.threshold > currentLevel.threshold,
        ) ?? null;
    const progress = nextLevel
        ? Math.min(
              1,
              Math.max(
                  0,
                  (resolvedXp - currentLevel.threshold) /
                      (nextLevel.threshold - currentLevel.threshold),
              ),
          )
        : 1;

    return {
        ...currentLevel,
        nextLevel,
        progress,
        xp: resolvedXp,
        xpToNext: nextLevel ? Math.max(0, nextLevel.threshold - resolvedXp) : 0,
    };
}

export function getLocalCalendarDay(timestamp) {
    const date = new Date(timestamp);

    if (!Number.isFinite(date.getTime())) {
        return '';
    }

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

export function getCleanDriveStreak(trips) {
    const orderedTrips = [...(Array.isArray(trips) ? trips : [])].sort(
        (first, second) =>
            finiteNumber(first?.endedAt, 0) - finiteNumber(second?.endedAt, 0),
    );
    let longest = 0;
    let current = 0;

    for (const trip of orderedTrips) {
        current =
            nonNegativeNumber(trip?.confirmedReadCount) === 0 ? current + 1 : 0;
        longest = Math.max(longest, current);
    }

    return { current, longest };
}

export function getScorecardTripFuelEstimate(state, trip) {
    const { fuelEconomyMpg, gasPricePerGallon } = getScorecardFuelCostSettings(
        state?.settings,
    );
    const extraMiles = nonNegativeNumber(trip?.extraMiles);
    const extraGallons = extraMiles / fuelEconomyMpg;
    const effectiveGasPrice =
        gasPricePerGallon ?? normalizeGasPricePerGallon(trip?.gasPrice);

    return {
        extraFuelCost:
            effectiveGasPrice === null
                ? extraMiles === 0
                    ? 0
                    : null
                : extraGallons * effectiveGasPrice,
        extraGallons,
        fuelEconomyMpg,
        gasPricePerGallon: effectiveGasPrice,
        usesCustomGasPrice: gasPricePerGallon !== null,
    };
}

export function setScorecardFuelCostSettings(
    state,
    { fuelEconomyMpg, gasPricePerGallon } = {},
) {
    const normalizedMpg = normalizeFuelEconomyMpg(fuelEconomyMpg);
    const normalizedGasPrice = normalizeGasPricePerGallon(gasPricePerGallon);

    if (normalizedMpg === null || normalizedGasPrice === null) {
        return state;
    }

    return {
        ...state,
        settings: {
            ...state.settings,
            fuelEconomyMpg: normalizedMpg,
            gasPricePerGallon: normalizedGasPrice,
        },
    };
}

export function resetScorecardFuelCostSettings(state) {
    return {
        ...state,
        settings: {
            ...state.settings,
            fuelEconomyMpg: null,
            gasPricePerGallon: null,
        },
    };
}

export function getScorecardWindowStats(state, now = Date.now()) {
    const retainedState = getScorecardStatsWindowState(state, now);
    const trips = retainedState.trips;
    const avoidedCameraCount = trips.reduce(
        (total, trip) => total + nonNegativeNumber(trip.avoidedCameraCount),
        0,
    );
    const confirmedReadCount = trips.reduce(
        (total, trip) => total + nonNegativeNumber(trip.confirmedReadCount),
        0,
    );
    const possibleReadCount = trips.reduce(
        (total, trip) => total + nonNegativeNumber(trip.possibleReadCount),
        0,
    );
    const extraMiles = trips.reduce(
        (total, trip) => total + nonNegativeNumber(trip.extraMiles),
        0,
    );
    const fuelEstimates = trips.map((trip) =>
        getScorecardTripFuelEstimate(state, trip),
    );
    const extraGallons = fuelEstimates.reduce(
        (total, estimate) => total + estimate.extraGallons,
        0,
    );
    const extraFuelCost = fuelEstimates.reduce(
        (total, estimate) => total + (estimate.extraFuelCost ?? 0),
        0,
    );
    const priceCoverageComplete = trips.every(
        (trip, index) =>
            nonNegativeNumber(trip.extraMiles) === 0 ||
            Number.isFinite(fuelEstimates[index].extraFuelCost),
    );
    const cleanDriveStreak = getCleanDriveStreak(trips);
    const exposureCoverageComplete = trips.every(
        (trip) => trip.exposureCoverageComplete === true,
    );

    return {
        avoidedCameraCount,
        confirmedReadCount,
        cleanDriveStreak: cleanDriveStreak.current,
        exposureCoverageComplete,
        extraFuelCost,
        extraGallons,
        extraMiles,
        possibleReadCount,
        priceCoverageComplete,
        privacyScore: getScorecardPrivacyScore(
            avoidedCameraCount,
            confirmedReadCount,
        ),
        trips,
    };
}

function routeOptionForKey(route, routeKey) {
    return route?.routes?.[routeKey] ?? null;
}

export function getAvoidableRouteCameraCandidates(route) {
    const directRoute = routeOptionForKey(route, 'direct');
    const selectedRouteKey = route?.selectedRouteKey ?? route?.routeKey;
    const selectedRoute =
        routeOptionForKey(route, selectedRouteKey) ?? route ?? null;

    if (!directRoute || !selectedRoute || selectedRouteKey === 'direct') {
        return [];
    }

    const selectedCameraIds = new Set(
        (selectedRoute.cameraCandidates ?? []).map((candidate) =>
            String(candidate.osmId),
        ),
    );

    return (directRoute.cameraCandidates ?? []).filter(
        (candidate) =>
            candidate.directionKnown === true &&
            Number.isFinite(candidate.routeProgressFraction) &&
            !selectedCameraIds.has(String(candidate.osmId)),
    );
}

export function createScorecardSession({
    exposureCoverageComplete = null,
    gasPrice = null,
    gasPriceRetrievedAt = null,
    gasPriceSourceAsOf = null,
    id,
    mode,
    startedAt,
    startingStateCode = null,
}) {
    return {
        creditedAvoidances: [],
        exposureCoverageObserved: typeof exposureCoverageComplete === 'boolean',
        exposureCoveragePending: typeof exposureCoverageComplete !== 'boolean',
        exposureCoverageWasTruncated: exposureCoverageComplete === false,
        gasPrice: Number.isFinite(gasPrice) ? gasPrice : null,
        gasPriceRetrievedAt,
        gasPriceSourceAsOf,
        id,
        mode: mode === 'guided' ? 'guided' : 'free',
        startedAt,
        startingStateCode:
            typeof startingStateCode === 'string' ? startingStateCode : null,
    };
}

export function creditAvoidedRouteCameras(
    session,
    route,
    progressFraction,
    earnedAt,
) {
    if (!session || session.mode !== 'guided') {
        return session;
    }

    const progress = Math.min(1, Math.max(0, finiteNumber(progressFraction)));
    const creditedIds = new Set(
        session.creditedAvoidances.map((candidate) => String(candidate.osmId)),
    );
    const newlyCredited = getAvoidableRouteCameraCandidates(route)
        .filter(
            (candidate) =>
                candidate.routeProgressFraction <= progress + 0.002 &&
                !creditedIds.has(String(candidate.osmId)),
        )
        .map((candidate) => ({
            coordinate: candidate.coordinate,
            earnedAt,
            osmId: String(candidate.osmId),
        }));

    return newlyCredited.length
        ? {
              ...session,
              creditedAvoidances: [
                  ...session.creditedAvoidances,
                  ...newlyCredited,
              ],
          }
        : session;
}

export function addScorecardExposure(state, exposure) {
    const normalizedExposure = normalizeExposure(exposure);

    if (
        !state.activeSession ||
        !normalizedExposure ||
        normalizedExposure.sessionId !== state.activeSession.id ||
        state.exposures.some((event) => event.id === normalizedExposure.id)
    ) {
        return state;
    }

    return {
        ...state,
        exposures: [...state.exposures, normalizedExposure],
    };
}

function badgeConditions(state, now) {
    const level = getScorecardLevel(state.lifetime.xp);
    const retainedTrips = getScorecardStatsWindowState(state, now).trips;
    const cleanDriveStreak = getCleanDriveStreak(retainedTrips);
    const windowStats = getScorecardWindowStats(state, now);
    const tripEndTimes = retainedTrips
        .map((trip) => finiteNumber(trip.endedAt, 0))
        .filter((endedAt) => endedAt > 0)
        .sort((first, second) => first - second);
    const coversThirtyDays =
        tripEndTimes.length >= 10 &&
        tripEndTimes[tripEndTimes.length - 1] - tripEndTimes[0] >=
            29 * 24 * 60 * 60 * 1000;

    return {
        cartographer: state.lifetime.contributedCameraCount >= 10,
        century: state.lifetime.avoidedCameraCount >= 100,
        'clean-week': cleanDriveStreak.longest >= 7,
        'first-detour': state.lifetime.privateTripsWithAvoidance >= 1,
        ghost: level.level >= 4,
        'zero-month': coversThirtyDays && windowStats.confirmedReadCount === 0,
    };
}

export function unlockEarnedScorecardBadges(state, now = Date.now()) {
    const conditions = badgeConditions(state, now);
    const badgeUnlocks = { ...state.badgeUnlocks };

    for (const badge of SCORECARD_BADGES) {
        if (conditions[badge.id] && !badgeUnlocks[badge.id]) {
            badgeUnlocks[badge.id] = now;
        }
    }

    return {
        ...state,
        badgeUnlocks,
    };
}

export function finalizeScorecardSession(
    state,
    {
        completion = 'manual',
        distanceMeters = 0,
        endedAt = Date.now(),
        extraDistanceMeters = 0,
        extraDurationSeconds = 0,
    } = {},
) {
    const session = state.activeSession;

    if (!session) {
        return { state, trip: null };
    }

    const sessionExposures = state.exposures.filter(
        (event) => event.sessionId === session.id,
    );
    const confirmedReadCount = sessionExposures.filter(
        (event) => event.certainty === 'confirmed',
    ).length;
    const possibleReadCount = sessionExposures.filter(
        (event) => event.certainty === 'possible',
    ).length;
    const exposureCoverageComplete =
        session.exposureCoverageObserved === true &&
        session.exposureCoveragePending !== true &&
        session.exposureCoverageWasTruncated !== true;
    const avoidedCameraCount = session.creditedAvoidances.length;
    const extraMiles = nonNegativeNumber(extraDistanceMeters) / 1609.344;
    const fuelSettings = getScorecardFuelCostSettings(state.settings);
    const effectiveGasPrice =
        fuelSettings.gasPricePerGallon ?? session.gasPrice;
    const extraGallons = extraMiles / fuelSettings.fuelEconomyMpg;
    const extraFuelCost = Number.isFinite(effectiveGasPrice)
        ? extraGallons * effectiveGasPrice
        : null;
    const cleanDrive = confirmedReadCount === 0;
    const trip = {
        avoidedCameraCount,
        avoidedCameras: session.creditedAvoidances,
        completion,
        confirmedReadCount,
        distanceMiles: nonNegativeNumber(distanceMeters) / 1609.344,
        durationSeconds: Math.max(
            0,
            Math.round((endedAt - session.startedAt) / 1000),
        ),
        endedAt,
        exposureEventIds: sessionExposures.map((event) => event.id),
        exposureCoverageComplete,
        exposureCoverageObserved: session.exposureCoverageObserved === true,
        exposureCoveragePending: session.exposureCoveragePending === true,
        exposureCoverageWasTruncated:
            session.exposureCoverageWasTruncated === true,
        extraFuelCost,
        extraGallons,
        extraMiles,
        extraDurationSeconds: nonNegativeNumber(extraDurationSeconds),
        fuelEconomyMpg: fuelSettings.fuelEconomyMpg,
        gasPrice: Number.isFinite(session.gasPrice) ? session.gasPrice : null,
        gasPriceRetrievedAt: session.gasPriceRetrievedAt ?? null,
        gasPriceSourceAsOf: session.gasPriceSourceAsOf ?? null,
        id: session.id,
        localDay: getLocalCalendarDay(endedAt),
        mode: session.mode,
        possibleReadCount,
        startedAt: session.startedAt,
        startingStateCode: session.startingStateCode,
        xpEarned: avoidedCameraCount * SCORECARD_XP_PER_AVOIDED_CAMERA,
    };
    const currentCleanDriveStreak = cleanDrive
        ? state.lifetime.currentCleanDriveStreak + 1
        : 0;
    const lifetime = {
        ...state.lifetime,
        avoidedCameraCount:
            state.lifetime.avoidedCameraCount + avoidedCameraCount,
        cleanDriveCount: state.lifetime.cleanDriveCount + (cleanDrive ? 1 : 0),
        completedDriveCount: state.lifetime.completedDriveCount + 1,
        confirmedReadCount:
            state.lifetime.confirmedReadCount + confirmedReadCount,
        currentCleanDriveStreak,
        extraFuelCost: state.lifetime.extraFuelCost + (extraFuelCost ?? 0),
        extraGallons: state.lifetime.extraGallons + extraGallons,
        extraMiles: state.lifetime.extraMiles + extraMiles,
        longestCleanDriveStreak: Math.max(
            state.lifetime.longestCleanDriveStreak,
            currentCleanDriveStreak,
        ),
        possibleReadCount: state.lifetime.possibleReadCount + possibleReadCount,
        privateTripsWithAvoidance:
            state.lifetime.privateTripsWithAvoidance +
            (session.mode === 'guided' && avoidedCameraCount > 0 ? 1 : 0),
        xp: state.lifetime.xp + trip.xpEarned,
    };
    const nextState = unlockEarnedScorecardBadges(
        {
            ...state,
            activeSession: null,
            lifetime,
            trips: [...state.trips, trip],
        },
        endedAt,
    );

    return { state: nextState, trip };
}

export function applyScorecardTripGasPrice(
    state,
    tripId,
    { price, retrievedAt = null, sourceAsOf = null } = {},
) {
    const numericPrice = Number(price);
    const tripIndex = state.trips.findIndex((trip) => trip.id === tripId);

    if (
        tripIndex < 0 ||
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0 ||
        numericPrice >= 20
    ) {
        return { state, trip: null };
    }

    const currentTrip = state.trips[tripIndex];
    const previousFuelCost = Number.isFinite(currentTrip.extraFuelCost)
        ? currentTrip.extraFuelCost
        : 0;
    const fuelEstimate = getScorecardTripFuelEstimate(state, {
        ...currentTrip,
        gasPrice: numericPrice,
    });
    const extraFuelCost = fuelEstimate.extraFuelCost ?? 0;
    const pricedTrip = {
        ...currentTrip,
        extraFuelCost,
        extraGallons: fuelEstimate.extraGallons,
        fuelEconomyMpg: fuelEstimate.fuelEconomyMpg,
        gasPrice: numericPrice,
        gasPriceRetrievedAt: normalizeOptionalText(retrievedAt, 50),
        gasPriceSourceAsOf: normalizeOptionalText(sourceAsOf, 50),
    };
    const trips = [...state.trips];

    trips[tripIndex] = pricedTrip;

    return {
        state: {
            ...state,
            lifetime: {
                ...state.lifetime,
                extraFuelCost: Math.max(
                    0,
                    state.lifetime.extraFuelCost -
                        previousFuelCost +
                        extraFuelCost,
                ),
            },
            trips,
        },
        trip: pricedTrip,
    };
}

export function recordScorecardContribution(
    state,
    now = Date.now(),
    count = 1,
) {
    return unlockEarnedScorecardBadges(
        {
            ...state,
            lifetime: {
                ...state.lifetime,
                contributedCameraCount:
                    state.lifetime.contributedCameraCount +
                    Math.max(0, Math.floor(finiteNumber(count))),
            },
        },
        now,
    );
}

export function getExposureScoreImpact(state, exposureId, now = Date.now()) {
    const stats = getScorecardWindowStats(state, now);
    const event = state.exposures.find(
        (exposure) => exposure.id === exposureId,
    );

    if (!event || event.certainty !== 'confirmed') {
        return 0;
    }

    const scoreWithoutEvent = getScorecardPrivacyScore(
        stats.avoidedCameraCount,
        Math.max(0, stats.confirmedReadCount - 1),
    );

    if (stats.privacyScore === null || scoreWithoutEvent === null) {
        return 0;
    }

    return stats.privacyScore - scoreWithoutEvent;
}
