import {
    createAutomotiveAlertHistory,
    normalizeAutomotiveAlertHistory,
} from './automotive-alert-policy.js';
import { getDrivingMapViewFollowConfiguration } from './driving-map-view.js';
import {
    createRouteProjectionPath,
    projectCoordinateOntoRoute,
} from './route-projection.js';

export const PRESENCE_POLICY = Object.freeze({
    earliestMs: 3000,
    latestMs: 15000,
    durationMs: 20000,
    sessionLimit: 15,
    spacingMs: 120000,
    nodeCooldownMs: 300000,
    driveEndMs: 1800000,
    isolationMeters: 150,
    maneuverSeconds: 30,
    maximumGapMs: 3000,
    maximumAccuracyMeters: 10,
    maximumVehiclePathOffsetMeters: 10,
    minimumProgressSampleMeters: 1,
    minimumPassProgressMeters: 12,
    maximumOutbox: 100,
});

const radians = (value) => (value * Math.PI) / 180;
export const presenceCoordinate = (node) => [
    node?.longitude == null ? NaN : Number(node.longitude),
    node?.latitude == null ? NaN : Number(node.latitude),
];
export function presenceDistance(a, b) {
    const latitude = radians((a[1] + b[1]) / 2);
    return Math.hypot((a[0] - b[0]) * Math.cos(latitude), a[1] - b[1]) * 111195;
}
/** Local travel axis from the GPS course, independent of any predicted road path. */
export function getPresenceMotionPath(location) {
    const coordinate = presenceCoordinate(location);
    if (
        !coordinate.every(Number.isFinite) ||
        !Number.isFinite(location?.heading)
    )
        return [];
    const heading = radians(location.heading);
    const longitudeScale =
        111195 * Math.max(0.01, Math.cos(radians(location.latitude)));
    return [-200, 1000].map((distance) => [
        ((coordinate[0] +
            (Math.sin(heading) * distance) / longitudeScale +
            540) %
            360) -
            180,
        coordinate[1] + (Math.cos(heading) * distance) / 111195,
    ]);
}
export function canonicalPresenceNodeId(node) {
    const id = Number(node?.osm_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function presenceLocationIsReliable(location, now) {
    const age = now - Number(location?.recordedAt ?? location?.timestamp);
    return Boolean(
        location &&
            Number.isFinite(location.latitude) &&
            Number.isFinite(location.longitude) &&
            Number.isFinite(location.accuracy) &&
            location.accuracy >= 0 &&
            location.accuracy <= PRESENCE_POLICY.maximumAccuracyMeters &&
            age >= 0 &&
            age <= PRESENCE_POLICY.maximumGapMs &&
            Number.isFinite(location.heading),
    );
}
export function presenceNodeIsIsolated(node, nodes, coverageComplete) {
    const id = canonicalPresenceNodeId(node);
    return (
        coverageComplete === true &&
        id !== null &&
        nodes.some(
            (other) =>
                canonicalPresenceNodeId(other) === id &&
                presenceDistance(
                    presenceCoordinate(node),
                    presenceCoordinate(other),
                ) < 5,
        ) &&
        nodes.every(
            (other) =>
                canonicalPresenceNodeId(other) === id ||
                presenceDistance(
                    presenceCoordinate(node),
                    presenceCoordinate(other),
                ) > PRESENCE_POLICY.isolationMeters,
        )
    );
}

/** Keeps the traveled path independently of the disappearing upcoming warning. */
export function createPresencePassDetector() {
    let approaches = new Map();
    let previous = null;
    let routeIdentity = null;
    let lastReason = 'Waiting for a reliable approach';
    let sampleGapMs = null;
    return {
        inspect() {
            return {
                reason: lastReason,
                trackedApproaches: approaches.size,
                sampleGapMs,
            };
        },
        reset() {
            lastReason = 'Pass tracking reset';
            approaches.clear();
            previous = null;
            routeIdentity = null;
        },
        update({
            location,
            nodes = [],
            coverageComplete,
            coordinates,
            routeKey,
            now,
        }) {
            const time = Number(location?.recordedAt ?? location?.timestamp);
            if (previous && time === previous.time) return null;
            if (!presenceLocationIsReliable(location, now)) {
                this.reset();
                lastReason = 'Location reliability rejected';
                return null;
            }
            const identityChanged = previous && routeIdentity !== routeKey;
            const delta = previous ? time - previous.time : 0;
            sampleGapMs = delta;
            lastReason = 'No qualifying approach';
            if (
                identityChanged ||
                (previous &&
                    (delta <= 0 || delta > PRESENCE_POLICY.maximumGapMs))
            ) {
                approaches.clear();
                lastReason = 'Route change or GPS gap';
            }
            routeIdentity = routeKey;
            const coordinate = presenceCoordinate(location);
            let encounter = null;
            for (const [id, approach] of approaches) {
                const projection = projectCoordinateOntoRoute(
                    approach.path,
                    coordinate,
                );
                const progress = projection?.distanceAlongRouteMeters;
                if (
                    !projection ||
                    projection.distanceFromRouteMeters >
                        PRESENCE_POLICY.maximumVehiclePathOffsetMeters ||
                    progress < approach.lastProgress - 2 ||
                    now - approach.startedAt > 60000
                ) {
                    approaches.delete(id);
                    lastReason = 'Tracked approach lost road/path continuity';
                    continue;
                }
                if (
                    progress - approach.lastProgress >=
                    PRESENCE_POLICY.minimumProgressSampleMeters
                ) {
                    approach.progressSamples++;
                    approach.lastProgress = progress;
                }
                if (
                    progress >=
                        approach.targetProgress +
                            PRESENCE_POLICY.minimumPassProgressMeters &&
                    approach.progressSamples >= 2
                ) {
                    approach.passedAt ??= time;
                    approach.passedHeading ??= location.heading;
                    if (now - approach.passedAt > PRESENCE_POLICY.latestMs) {
                        approaches.delete(id);
                        lastReason =
                            'Pass opportunity expired while waiting for inventory';
                        continue;
                    }
                    if (
                        presenceNodeIsIsolated(
                            approach.node,
                            nodes,
                            coverageComplete,
                        )
                    ) {
                        approaches.delete(id);
                        encounter = {
                            ...approach,
                            passedAt: approach.passedAt,
                            passedHeading: approach.passedHeading,
                            osmNodeId: id,
                            routeKey,
                        };
                    }
                }
            }
            if (!identityChanged && coordinates?.length >= 2) {
                const path = createRouteProjectionPath(coordinates);
                const vehicle = projectCoordinateOntoRoute(path, coordinate);
                if (
                    vehicle &&
                    vehicle.distanceFromRouteMeters <=
                        PRESENCE_POLICY.maximumVehiclePathOffsetMeters
                ) {
                    for (const node of nodes) {
                        const id = canonicalPresenceNodeId(node);
                        if (
                            !id ||
                            approaches.has(id) ||
                            !presenceNodeIsIsolated(
                                node,
                                nodes,
                                coverageComplete,
                            )
                        )
                            continue;
                        const target = projectCoordinateOntoRoute(
                            path,
                            presenceCoordinate(node),
                        );
                        const ahead =
                            target?.distanceAlongRouteMeters -
                            vehicle.distanceAlongRouteMeters;
                        if (
                            !target ||
                            ahead < 20 ||
                            ahead > 150 ||
                            presenceDistance(
                                coordinate,
                                presenceCoordinate(node),
                            ) > 150
                        )
                            continue;
                        approaches.set(id, {
                            node: { ...node },
                            path,
                            targetProgress: target.distanceAlongRouteMeters,
                            lastProgress: vehicle.distanceAlongRouteMeters,
                            progressSamples: 0,
                            startedAt: now,
                            street:
                                typeof node.tags?.['addr:street'] === 'string'
                                    ? node.tags['addr:street'].slice(0, 200)
                                    : null,
                        });
                    }
                }
            }
            if (encounter) lastReason = 'Confident pass established';
            else if (approaches.size)
                lastReason = [...approaches.values()].some(
                    (approach) => approach.passedAt != null,
                )
                    ? 'Passed camera; waiting for inventory coverage and isolation'
                    : 'Tracking approach; waiting to pass by 12 meters';
            previous = { time };
            return encounter;
        },
    };
}

export function presenceGuardsHold(context, encounter, now) {
    return Boolean(
        context.enabled &&
            context.connected &&
            context.visible &&
            !context.blocked &&
            !context.warningBusy &&
            !context.manual &&
            context.routeKey === encounter.routeKey &&
            presenceLocationIsReliable(context.location, now) &&
            Math.cos(
                radians(context.location.heading - encounter.passedHeading),
            ) >= Math.cos(radians(30)) &&
            (context.navigationActive !== true ||
                (Number.isFinite(context.maneuverSeconds) &&
                    context.maneuverSeconds >=
                        PRESENCE_POLICY.maneuverSeconds)) &&
            presenceNodeIsIsolated(
                encounter.node,
                context.nodes,
                context.coverageComplete,
            ),
    );
}

/** Centers the passed node using the navigation camera captured for this alert. */
export function inspectPresenceFocus(
    encounter,
    context,
    remainingMs = PRESENCE_POLICY.durationMs,
) {
    const location = context.location;
    const viewport = context.viewport;
    if (
        !viewport ||
        viewport.visibleWidth < 200 ||
        viewport.visibleHeight < 180
    )
        return {
            focus: null,
            reason: 'Car map viewport unavailable or too small',
        };
    const vehicle = presenceCoordinate(location);
    const projection = projectCoordinateOntoRoute(encounter.path, vehicle);
    if (
        !projection ||
        projection.distanceFromRouteMeters >
            PRESENCE_POLICY.maximumVehiclePathOffsetMeters
    )
        return { focus: null, reason: 'Vehicle left the tracked road path' };
    const camera = presenceCoordinate(encounter.node);
    const angle = radians(context.presenceFocus?.heading ?? location.heading);
    const scale = 111195 * Math.cos(radians(vehicle[1]));
    const rotate = (point) => {
        const x = (point[0] - vehicle[0]) * scale,
            y = (point[1] - vehicle[1]) * 111195;
        return [
            x * Math.cos(angle) - y * Math.sin(angle),
            x * Math.sin(angle) + y * Math.cos(angle),
        ];
    };
    const savedFocus = context.presenceFocus;
    const navigationCamera = context.navigationCamera;
    const zoomLevel =
        savedFocus?.zoomLevel ?? navigationCamera?.zoomLevel ?? 17;
    const pitch =
        savedFocus?.pitch ??
        navigationCamera?.pitch ??
        getDrivingMapViewFollowConfiguration().pitch;
    const heading = savedFocus?.heading ?? location.heading;
    const [cx, cy] = rotate(camera);
    const fixedMetersPerPixel =
        (78271.517 * Math.cos(radians(camera[1]))) / 2 ** zoomLevel;
    // Include additional ground visible with the navigation camera tilted.
    const perspectiveScale = 1 / Math.max(0.1, Math.cos(radians(pitch)));
    const halfWidth =
        (viewport.visibleWidth * fixedMetersPerPixel * perspectiveScale) / 2;
    const halfHeight =
        (viewport.visibleHeight * fixedMetersPerPixel * perspectiveScale) / 2;
    const metrics = {
        spanMeters: Math.max(halfWidth, halfHeight) * 2,
        zoomLevel,
    };
    if (context.coverageCenter) {
        const [coverageX, coverageY] = rotate(context.coverageCenter);
        metrics.requiredCoverageMeters = Math.hypot(
            Math.abs(cx - coverageX) + halfWidth,
            Math.abs(cy - coverageY) + halfHeight,
        );
        metrics.availableCoverageMeters = context.coverageRadiusMeters ?? 350;
        if (
            metrics.requiredCoverageMeters >
            metrics.availableCoverageMeters - 10
        )
            return {
                focus: null,
                reason: 'Map frame extends beyond loaded camera coverage',
                ...metrics,
            };
    }
    if (
        context.nodes.some((node) => {
            if (canonicalPresenceNodeId(node) === encounter.osmNodeId)
                return false;
            const [x, y] = rotate(presenceCoordinate(node));
            return (
                Math.abs(x - cx) <= halfWidth && Math.abs(y - cy) <= halfHeight
            );
        })
    )
        return {
            focus: null,
            reason: 'Another camera is visible in the confirmation frame',
            ...metrics,
        };
    return {
        reason: null,
        ...metrics,
        focus: {
            animationDuration: 0,
            centerCoordinate: camera,
            heading,
            pitch,
            zoomLevel,
            padding: savedFocus?.padding ?? { ...viewport.cameraPadding },
        },
    };
}

export function getPresenceFocus(
    encounter,
    context,
    remainingMs = PRESENCE_POLICY.durationMs,
) {
    return inspectPresenceFocus(encounter, context, remainingMs).focus;
}

export function createPresenceState(reporterId, now) {
    const driveId = `${reporterId}:${now}`;

    return {
        version: 1,
        reporterId,
        automotiveAlertHistory: createAutomotiveAlertHistory(driveId),
        drive: {
            id: driveId,
            count: 0,
            lastActivityAt: now,
            disconnectedAt: now,
            connected: false,
        },
        lastPromptAt: null,
        nodeTimes: {},
        outbox: [],
    };
}
export function parsePresenceState(value) {
    const state = JSON.parse(value);
    if (
        state?.version !== 1 ||
        typeof state.reporterId !== 'string' ||
        state.reporterId.length < 32 ||
        !state.drive ||
        typeof state.drive.id !== 'string' ||
        !Number.isInteger(state.drive.count) ||
        state.drive.count < 0 ||
        !Number.isFinite(state.drive.lastActivityAt) ||
        typeof state.drive.connected !== 'boolean' ||
        !(
            state.drive.disconnectedAt === null ||
            Number.isFinite(state.drive.disconnectedAt)
        ) ||
        !(state.lastPromptAt === null || Number.isFinite(state.lastPromptAt)) ||
        !state.nodeTimes ||
        Array.isArray(state.nodeTimes) ||
        !Object.values(state.nodeTimes).every(Number.isFinite) ||
        !Array.isArray(state.outbox) ||
        state.outbox.length > PRESENCE_POLICY.maximumOutbox ||
        !state.outbox.every(
            (item) =>
                Number.isInteger(item.attempts) &&
                item.attempts >= 0 &&
                (item.retryAt === null || Number.isFinite(item.retryAt)) &&
                item.payload?.response === 'not_there' &&
                ['android_auto', 'carplay'].includes(item.payload.platform) &&
                Number.isSafeInteger(item.payload.osm_node_id) &&
                item.payload.osm_node_id > 0 &&
                item.payload.reporter_id === state.reporterId &&
                typeof item.payload.event_key === 'string' &&
                item.payload.event_key.length >= 16 &&
                ['passed_at', 'occurred_at', 'submitted_at'].every((key) =>
                    Number.isFinite(Date.parse(item.payload[key])),
                ),
        )
    )
        throw new Error('Invalid presence state');
    return {
        ...state,
        automotiveAlertHistory: normalizeAutomotiveAlertHistory(
            state.automotiveAlertHistory,
            state.drive.id,
        ),
    };
}
export function updatePresenceDrive(state, { connected, driving, now }) {
    const drive = { ...state.drive };
    let automotiveAlertHistory = normalizeAutomotiveAlertHistory(
        state.automotiveAlertHistory,
        drive.id,
    );
    if (
        !drive.connected &&
        drive.disconnectedAt !== null &&
        now - Math.max(drive.disconnectedAt, drive.lastActivityAt) >=
            PRESENCE_POLICY.driveEndMs
    ) {
        drive.count = 0;
        drive.id = `${state.reporterId}:${now}`;
        automotiveAlertHistory = createAutomotiveAlertHistory(drive.id);
    }
    if (!connected && drive.connected) drive.disconnectedAt = now;
    if (connected) drive.disconnectedAt = null;
    if (driving || connected) drive.lastActivityAt = now;
    drive.connected = connected;
    return { ...state, automotiveAlertHistory, drive };
}
export function canStartPresencePrompt(state, encounter, now) {
    return Boolean(
        state &&
            state.drive.count < PRESENCE_POLICY.sessionLimit &&
            (state.lastPromptAt === null ||
                now - state.lastPromptAt >= PRESENCE_POLICY.spacingMs) &&
            (state.nodeTimes[encounter.osmNodeId] === undefined ||
                now - state.nodeTimes[encounter.osmNodeId] >=
                    PRESENCE_POLICY.nodeCooldownMs) &&
            now - encounter.passedAt >= PRESENCE_POLICY.earliestMs &&
            now - encounter.passedAt <= PRESENCE_POLICY.latestMs,
    );
}
export function recordPresencePrompt(state, encounter, now) {
    return {
        ...state,
        drive: { ...state.drive, count: state.drive.count + 1 },
        lastPromptAt: now,
        nodeTimes: {
            ...Object.fromEntries(
                Object.entries(state.nodeTimes).filter(
                    ([, time]) => now - time < PRESENCE_POLICY.nodeCooldownMs,
                ),
            ),
            [encounter.osmNodeId]: now,
        },
    };
}
