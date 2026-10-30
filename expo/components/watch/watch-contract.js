export const WATCH_PROTOCOL_VERSION = 1;
export const WATCH_STALE_AFTER_MS = 15_000;
export const WATCH_PROGRESS_INTERVAL_MS = 1_000;

const MANEUVERS = [
    'left',
    'right',
    'sharp-left',
    'sharp-right',
    'slight-left',
    'slight-right',
    'straight',
    'roundabout',
    'roundabout',
    'uturn',
    'arrive',
    'depart',
    'keep-left',
    'keep-right',
];
const finite = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null;
const label = (value) => (typeof value === 'string' ? value.slice(0, 240) : '');

export function semanticWatchManeuver(maneuver, routeRevision) {
    const kind = Number.isInteger(maneuver?.type)
        ? MANEUVERS[maneuver.type]
        : null;
    if (!kind) return null;
    return {
        id: `${routeRevision}:${maneuver.stepIndex ?? 0}`,
        kind,
        instruction: label(maneuver.instruction || maneuver.typeLabel),
        distanceMeters: finite(maneuver.distanceToManeuver),
        exitNumber:
            Number.isInteger(maneuver.exit_number) && maneuver.exit_number > 0
                ? maneuver.exit_number
                : null,
    };
}

// Explicit projection prevents coordinates, route geometry, or credentials entering transport.
export function createWatchSnapshot({
    publisherId,
    publisherStartedAt,
    revision,
    now,
    environment,
    phoneVersion,
    sessionId,
    routeRevision,
    active,
    rerouting,
    sourceAt,
    destination,
    maneuver,
    remaining,
    scorecard,
}) {
    const normalizedManeuver = semanticWatchManeuver(maneuver, routeRevision);
    const navigationStatus = !active
        ? 'idle'
        : rerouting
          ? 'rerouting'
          : finite(sourceAt) === null
            ? 'waiting-for-location'
            : !normalizedManeuver
              ? 'missing-maneuver'
              : 'active';
    const scoreStatus = scorecard?.status ?? 'unavailable';
    return {
        protocolVersion: WATCH_PROTOCOL_VERSION,
        publisherId,
        publisherStartedAt,
        revision,
        publishedAt: now,
        environment,
        phoneVersion,
        navigation: {
            status: navigationStatus,
            sessionId: active ? sessionId : null,
            routeRevision,
            sourceAt: active ? finite(sourceAt) : now,
            destination: active ? label(destination) : '',
            maneuver: navigationStatus === 'active' ? normalizedManeuver : null,
            distanceRemainingMeters: active
                ? finite(remaining?.distanceRemaining)
                : null,
            durationRemainingSeconds:
                active && finite(sourceAt) !== null
                    ? finite(remaining?.durationRemaining)
                    : null,
            arrivalAt:
                active &&
                finite(sourceAt) !== null &&
                finite(remaining?.durationRemaining) !== null
                    ? sourceAt + remaining.durationRemaining * 1000
                    : null,
        },
        scorecard: {
            status:
                active ||
                scoreStatus === 'tracking-off' ||
                scoreStatus === 'initializing'
                    ? scoreStatus
                    : 'no-active-drive',
            sessionId:
                active && scoreStatus === 'active'
                    ? label(scorecard.sessionId)
                    : null,
            sourceAt: active ? finite(scorecard?.sourceAt) : now,
            elapsedSeconds:
                active && scoreStatus === 'active'
                    ? finite(scorecard.elapsedSeconds)
                    : null,
            distanceMeters:
                active && scoreStatus === 'active'
                    ? finite(scorecard.distanceMeters)
                    : null,
            confirmedCrossings:
                active && scoreStatus === 'active'
                    ? finite(scorecard.confirmedCrossings)
                    : null,
            possibleCrossings:
                active && scoreStatus === 'active'
                    ? finite(scorecard.possibleCrossings)
                    : null,
            cameraCrossings:
                active && scoreStatus === 'active'
                    ? finite(scorecard.cameraCrossings)
                    : null,
        },
    };
}

export function watchSnapshotStateKey(snapshot) {
    const { navigation: nav, scorecard } = snapshot;
    return JSON.stringify([
        nav.status,
        nav.sessionId,
        nav.routeRevision,
        nav.maneuver?.id,
        scorecard.status,
        scorecard.cameraCrossings,
    ]);
}

export function watchSourceIsStale(sourceAt, now) {
    return (
        finite(sourceAt) === null ||
        now < sourceAt - 5_000 ||
        now - sourceAt >= WATCH_STALE_AFTER_MS
    );
}
