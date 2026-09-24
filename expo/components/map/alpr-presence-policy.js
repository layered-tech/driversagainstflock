import {
    createAutomotiveAlertHistory,
    normalizeAutomotiveAlertHistory,
} from './automotive-alert-policy.js';
import { getDrivingMapViewFollowConfiguration } from './driving-map-view.js';
import {
    getRouteProjectionPath,
    projectCoordinateOntoRoute,
} from './route-projection.js';

export const PRESENCE_POLICY = Object.freeze({
    earliestMs: 3000,
    latestMs: 15000,
    durationMs: 20000,
    spacingMs: 3 * 60 * 1000,
    nodeCooldownMs: 7 * 24 * 60 * 60 * 1000,
    driveEndMs: 1800000,
    isolationMeters: 150,
    trackingDistanceMeters: 150,
    forwardPassDistanceMeters: 30,
    leftPassDistanceMeters: 40,
    rightPassDistanceMeters: 20,
    maneuverSeconds: 30,
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
export function presenceNodeIsWithinTrackingRange(location, node) {
    return (
        presenceDistance(
            presenceCoordinate(location),
            presenceCoordinate(node),
        ) <= PRESENCE_POLICY.trackingDistanceMeters
    );
}

/** Signed distance ahead of the vehicle's current left/right plane. */
export function presenceAheadMeters(location, coordinate) {
    const vehicle = presenceCoordinate(location);
    const longitudeDelta = ((coordinate[0] - vehicle[0] + 540) % 360) - 180;
    const east = longitudeDelta * 111195 * Math.cos(radians(vehicle[1]));
    const north = (coordinate[1] - vehicle[1]) * 111195;
    return (
        east * Math.sin(radians(location.heading)) +
        north * Math.cos(radians(location.heading))
    );
}

/** Sweeps the heading-relative confirmation area along an observed GPS segment. */
export function presenceSegmentIsWithinRange(start, location, target) {
    const heading = radians(location.heading);
    const relative = (origin) => {
        const east =
            (((target[0] - origin[0] + 540) % 360) - 180) *
            111195 *
            Math.cos(radians(location.latitude));
        const north = (target[1] - origin[1]) * 111195;
        return [
            east * Math.sin(heading) + north * Math.cos(heading),
            east * Math.cos(heading) - north * Math.sin(heading),
        ];
    };
    const a = relative(start);
    const b = relative(presenceCoordinate(location));
    const delta = [b[0] - a[0], b[1] - a[1]];
    return [
        [PRESENCE_POLICY.leftPassDistanceMeters, -1],
        [PRESENCE_POLICY.rightPassDistanceMeters, 1],
    ].some(([width, side]) => {
        const length = PRESENCE_POLICY.forwardPassDistanceMeters;
        const denominator = (delta[0] / length) ** 2 + (delta[1] / width) ** 2;
        const minimum =
            denominator > 0
                ? -(
                      (a[0] * delta[0]) / length ** 2 +
                      (a[1] * delta[1]) / width ** 2
                  ) / denominator
                : 0;
        const candidates = [0, 1, Math.max(0, Math.min(1, minimum))];
        if (delta[1] !== 0)
            candidates.push(Math.max(0, Math.min(1, -a[1] / delta[1])));
        return candidates.some((t) => {
            const forward = a[0] + delta[0] * t;
            const right = a[1] + delta[1] * t;
            return (
                right * side >= -1e-9 &&
                (forward / length) ** 2 + (right / width) ** 2 <= 1
            );
        });
    });
}

function updatePresencePlaneCrossing(approach, location) {
    const coordinate = presenceCoordinate(location);
    const ahead = presenceAheadMeters(
        location,
        presenceCoordinate(approach.node),
    );
    const movement = -presenceAheadMeters(location, approach.lastCoordinate);
    const minimumMovement = PRESENCE_POLICY.minimumProgressSampleMeters;
    if (ahead > -PRESENCE_POLICY.minimumPassProgressMeters)
        approach.behindSamples = 0;
    if (presenceDistance(coordinate, approach.lastCoordinate) < minimumMovement)
        return approach.behindSamples >= 2;
    approach.lastCoordinate = coordinate;
    if (movement < minimumMovement) {
        approach.behindSamples = 0;
        return false;
    }
    if (ahead <= -PRESENCE_POLICY.minimumPassProgressMeters)
        approach.behindSamples++;
    return approach.behindSamples >= 2;
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
export function presenceLocationIsReliable(location) {
    return Boolean(
        location &&
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude) &&
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
    let routeIdentity = null;
    let lastReason = 'Waiting for a reliable approach';
    return {
        inspect(includeGeometry = false) {
            return {
                reason: lastReason,
                trackedApproaches: approaches.size,
                ...(includeGeometry
                    ? { approaches: [...approaches.values()] }
                    : {}),
            };
        },
        reset() {
            lastReason = 'Pass tracking reset';
            approaches.clear();
            routeIdentity = null;
        },
        update({
            location,
            nodes = [],
            coverageComplete,
            coordinates,
            routeKey,
            navigationActive,
            now,
        }) {
            if (!presenceLocationIsReliable(location)) {
                this.reset();
                lastReason = 'Location reliability rejected';
                return null;
            }
            const identityChanged =
                routeIdentity !== null && routeIdentity !== routeKey;
            lastReason = 'No qualifying approach';
            if (identityChanged) {
                approaches.clear();
                lastReason = 'Route changed';
            }
            routeIdentity = routeKey;
            const coordinate = presenceCoordinate(location);
            let encounter = null;
            for (const [id, approach] of approaches) {
                if (
                    now - approach.startedAt > 60000 ||
                    !presenceNodeIsWithinTrackingRange(location, approach.node)
                ) {
                    approaches.delete(id);
                    lastReason =
                        'Tracked approach expired or camera is no longer nearby';
                    continue;
                }
                const movementPath = getRouteProjectionPath([
                    approach.sampleCoordinate,
                    coordinate,
                ]);
                const proximity = projectCoordinateOntoRoute(
                    movementPath,
                    presenceCoordinate(approach.node),
                );
                approach.closestDistanceMeters = Math.min(
                    approach.closestDistanceMeters,
                    proximity?.distanceFromRouteMeters ?? Infinity,
                    presenceDistance(
                        coordinate,
                        presenceCoordinate(approach.node),
                    ),
                );
                approach.withinPassRange ||= presenceSegmentIsWithinRange(
                    approach.sampleCoordinate,
                    location,
                    presenceCoordinate(approach.node),
                );
                approach.sampleCoordinate = coordinate;
                let passed;
                if (approach.passMethod === 'gps-plane') {
                    passed = updatePresencePlaneCrossing(approach, location);
                } else {
                    const projection = projectCoordinateOntoRoute(
                        approach.path,
                        coordinate,
                    );
                    const progress = projection?.distanceAlongRouteMeters;
                    if (
                        !projection ||
                        projection.distanceFromRouteMeters >
                            PRESENCE_POLICY.maximumVehiclePathOffsetMeters ||
                        progress < approach.lastProgress - 2
                    ) {
                        approaches.delete(id);
                        lastReason =
                            'Tracked approach lost road/path continuity';
                        continue;
                    }
                    if (
                        progress - approach.lastProgress >=
                        PRESENCE_POLICY.minimumProgressSampleMeters
                    ) {
                        approach.progressSamples++;
                        approach.lastProgress = progress;
                    }
                    passed =
                        progress >=
                            approach.targetProgress +
                                PRESENCE_POLICY.minimumPassProgressMeters &&
                        approach.progressSamples >= 2;
                }
                if (passed && approach.withinPassRange) {
                    approach.passedAt ??= now;
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
                const path = getRouteProjectionPath(coordinates);
                const vehicle = projectCoordinateOntoRoute(path, coordinate);
                if (
                    vehicle &&
                    vehicle.distanceFromRouteMeters <=
                        PRESENCE_POLICY.maximumVehiclePathOffsetMeters
                ) {
                    for (const node of nodes) {
                        const id = canonicalPresenceNodeId(node);
                        const nodeCoordinate = presenceCoordinate(node);
                        if (
                            !id ||
                            approaches.has(id) ||
                            presenceDistance(coordinate, nodeCoordinate) >
                                PRESENCE_POLICY.trackingDistanceMeters ||
                            !presenceNodeIsIsolated(
                                node,
                                nodes,
                                coverageComplete,
                            )
                        )
                            continue;
                        const target = projectCoordinateOntoRoute(
                            path,
                            nodeCoordinate,
                        );
                        const ahead =
                            navigationActive === false
                                ? presenceAheadMeters(location, nodeCoordinate)
                                : target?.distanceAlongRouteMeters -
                                  vehicle.distanceAlongRouteMeters;
                        if (
                            !target ||
                            ahead < 20 ||
                            ahead > PRESENCE_POLICY.trackingDistanceMeters
                        )
                            continue;
                        approaches.set(id, {
                            node: { ...node },
                            passMethod:
                                navigationActive === false
                                    ? 'gps-plane'
                                    : 'route',
                            withinPassRange: presenceSegmentIsWithinRange(
                                coordinate,
                                location,
                                nodeCoordinate,
                            ),
                            sampleCoordinate: coordinate,
                            closestDistanceMeters: presenceDistance(
                                coordinate,
                                nodeCoordinate,
                            ),
                            lastCoordinate: coordinate,
                            behindSamples: 0,
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
            return encounter;
        },
    };
}

export function presenceGuardsHold(context, encounter) {
    return Boolean(
        context.enabled &&
        context.connected &&
        !context.blocked &&
        !context.warningBusy &&
        !context.manual &&
        context.routeKey === encounter.routeKey &&
        presenceLocationIsReliable(context.location) &&
        (encounter.passMethod === 'gps-plane'
            ? presenceAheadMeters(
                  context.location,
                  presenceCoordinate(encounter.node),
              ) <= 0
            : Math.cos(
                  radians(context.location.heading - encounter.passedHeading),
              ) >= Math.cos(radians(30))) &&
        (context.navigationActive !== true ||
            (Number.isFinite(context.maneuverSeconds) &&
                context.maneuverSeconds >= PRESENCE_POLICY.maneuverSeconds)) &&
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
    const vehicle = presenceCoordinate(location);
    // Free-driving geometry is a past GPS tangent, not the road ahead.
    if (context.navigationActive === true) {
        const projection = projectCoordinateOntoRoute(encounter.path, vehicle);
        if (
            !projection ||
            projection.distanceFromRouteMeters >
                PRESENCE_POLICY.maximumVehiclePathOffsetMeters
        )
            return {
                focus: null,
                reason: 'Vehicle left the tracked road path',
            };
    }
    if (
        !viewport ||
        viewport.visibleWidth < 200 ||
        viewport.visibleHeight < 180
    ) {
        if (context.presenceFocus) {
            return { focus: context.presenceFocus, reason: null };
        }
        return {
            focus: null,
            reason: 'Car map viewport unavailable or too small',
        };
    }
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
    const zoomLevel = 17;
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

export function createPresenceState(driveId, now) {
    return {
        version: 2,
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
export function parsePresenceState(value, createDriveId, now = Date.now()) {
    let state = JSON.parse(value);
    if (state?.version === 1) {
        if (
            typeof createDriveId !== 'function' ||
            typeof state.reporterId !== 'string' ||
            state.reporterId.length < 32 ||
            !Array.isArray(state.outbox)
        )
            throw new Error('Invalid presence state');
        const { reporterId, ...legacy } = state;
        const driveId = createDriveId();
        state = {
            ...legacy,
            version: 2,
            drive: { ...legacy.drive, id: driveId },
            automotiveAlertHistory: legacy.automotiveAlertHistory
                ? { ...legacy.automotiveAlertHistory, driveId }
                : undefined,
            outbox: legacy.outbox.map((item) => {
                if (item?.payload?.reporter_id !== reporterId)
                    throw new Error('Invalid presence state');
                const { reporter_id, ...payload } = item.payload;
                return { ...item, payload };
            }),
        };
    }
    if (
        state?.version !== 2 ||
        !state.drive ||
        typeof state.drive.id !== 'string' ||
        state.drive.id.length < 16 ||
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
                !Object.hasOwn(item.payload, 'reporter_id') &&
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
            now,
        ),
    };
}
export function updatePresenceDrive(
    state,
    { connected, driving, now, createDriveId },
) {
    const drive = { ...state.drive };
    let automotiveAlertHistory = normalizeAutomotiveAlertHistory(
        state.automotiveAlertHistory,
        drive.id,
        now,
    );
    if (
        !drive.connected &&
        drive.disconnectedAt !== null &&
        now - Math.max(drive.disconnectedAt, drive.lastActivityAt) >=
            PRESENCE_POLICY.driveEndMs
    ) {
        drive.count = 0;
        drive.id = `${createDriveId()}:${now}`;
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
