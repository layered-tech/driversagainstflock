import {
    canonicalPresenceNodeId,
    inspectPresenceFocus,
    PRESENCE_POLICY,
    presenceAheadMeters,
    presenceCoordinate,
    presenceDistance,
    presenceLocationIsReliable,
    presenceNodeIsIsolated,
} from './alpr-presence-policy.js';
import {
    getRouteProjectionPath,
    projectCoordinateOntoRoute,
} from './route-projection.js';

const rounded = (value) =>
    Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

/** Exports aggregate camera movement without coordinates or frame history. */
export function createPresenceCameraDiagnostics() {
    let focus = null;
    let snapshot = null;
    return {
        reset(nextFocus) {
            focus = nextFocus;
            snapshot = {
                samples: 0,
                offTargetSamples: 0,
                centerOffsetMeters: null,
                maximumCenterOffsetMeters: null,
                zoomDelta: null,
                maximumZoomDelta: null,
                pitchDelta: null,
            };
        },
        record(state) {
            if (!focus) return;
            const camera = state?.properties;
            const center = camera?.center;
            if (
                !Array.isArray(center) ||
                center.length !== 2 ||
                !center.every(Number.isFinite)
            )
                return;
            const offset = presenceDistance(center, focus.centerCoordinate);
            if (!Number.isFinite(offset)) return;
            const zoomDelta = Number.isFinite(camera?.zoom)
                ? Math.abs(camera.zoom - focus.zoomLevel)
                : null;
            snapshot = {
                samples: snapshot.samples + 1,
                offTargetSamples:
                    snapshot.offTargetSamples + (offset > 5 ? 1 : 0),
                centerOffsetMeters: rounded(offset),
                maximumCenterOffsetMeters: rounded(
                    Math.max(snapshot.maximumCenterOffsetMeters ?? 0, offset),
                ),
                zoomDelta: rounded(zoomDelta),
                maximumZoomDelta: Number.isFinite(zoomDelta)
                    ? rounded(
                          Math.max(snapshot.maximumZoomDelta ?? 0, zoomDelta),
                      )
                    : snapshot.maximumZoomDelta,
                pitchDelta: Number.isFinite(camera?.pitch)
                    ? rounded(Math.abs(camera.pitch - focus.pitch))
                    : null,
            };
        },
        getSnapshot: () => snapshot,
    };
}

/** Deliberately excludes coordinates, route geometry, reporter identity and report payloads. */
export function buildPresenceDebugSnapshot(
    {
        context,
        encounter,
        phase,
        pass,
        remainingMs = PRESENCE_POLICY.durationMs,
    },
    state,
    now,
) {
    const location = context.location;
    const age = now - Number(location?.recordedAt ?? location?.timestamp);
    const match = location?.roadMatch;
    const path = getRouteProjectionPath(context.coordinates ?? []);
    const vehicle = projectCoordinateOntoRoute(
        path,
        presenceCoordinate(location),
    );
    const targets = (context.nodes ?? [])
        .map((node) => {
            const projection = projectCoordinateOntoRoute(
                path,
                presenceCoordinate(node),
            );
            return {
                osmNodeId: canonicalPresenceNodeId(node),
                distanceMeters: rounded(
                    presenceDistance(
                        presenceCoordinate(location),
                        presenceCoordinate(node),
                    ),
                ),
                pathOffsetMeters: rounded(projection?.distanceFromRouteMeters),
                aheadMeters: rounded(
                    projection && vehicle
                        ? projection.distanceAlongRouteMeters -
                              vehicle.distanceAlongRouteMeters
                        : null,
                ),
                isolated: context.coverageComplete
                    ? presenceNodeIsIsolated(node, context.nodes, true)
                    : null,
            };
        })
        .sort(
            (a, b) =>
                (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
        )
        .slice(0, 8);
    const frame = encounter
        ? inspectPresenceFocus(encounter, context, remainingMs)
        : null;
    const blockers = [];
    if (!context.enabled) blockers.push('Root driving map not ready');
    if (!context.connected) blockers.push('Car disconnected');
    if (context.blocked)
        blockers.push('Search, preview, route loading or map overview');
    if (context.manual) blockers.push('Manual map control');
    if (context.warningBusy) blockers.push('Upcoming warning has priority');
    if (!presenceLocationIsReliable(location)) {
        if (!location) blockers.push('Location unavailable');
        else {
            if (
                !Number.isFinite(location.latitude) ||
                !Number.isFinite(location.longitude)
            )
                blockers.push('Location coordinates unavailable');
            if (
                !Number.isFinite(location.accuracy) ||
                location.accuracy < 0 ||
                location.accuracy > PRESENCE_POLICY.maximumAccuracyMeters
            )
                blockers.push('GPS accuracy outside limit');
            if (!Number.isFinite(location.heading))
                blockers.push('Heading unavailable');
        }
    }
    if (!context.coverageComplete)
        blockers.push('Nearby camera coverage unavailable or stale');
    if (!(context.coordinates?.length >= 2))
        blockers.push('Road/route path unavailable');
    if (
        context.navigationActive === true &&
        !(context.maneuverSeconds >= PRESENCE_POLICY.maneuverSeconds)
    )
        blockers.push('Less than 30 seconds of confirmed maneuver clearance');
    if (!state) blockers.push('Encrypted limits unavailable');
    else if (phase !== 'showing' && phase !== 'presenting') {
        if (
            state.lastPromptAt !== null &&
            now - state.lastPromptAt < PRESENCE_POLICY.spacingMs
        )
            blockers.push(
                `Global ${PRESENCE_POLICY.spacingMs / 1000}-second cooldown`,
            );
        if (
            encounter &&
            now - (state.nodeTimes[encounter.osmNodeId] ?? -Infinity) <
                PRESENCE_POLICY.nodeCooldownMs
        )
            blockers.push('Same-node 7-day cooldown');
        if (state.outbox.length >= PRESENCE_POLICY.maximumOutbox)
            blockers.push('Pending report queue full');
    }
    if (encounter) {
        if (now - encounter.passedAt < PRESENCE_POLICY.earliestMs)
            blockers.push('Waiting until pass + 3 seconds');
        if (
            phase === 'pending' &&
            now - encounter.passedAt > PRESENCE_POLICY.latestMs
        )
            blockers.push('Pass opportunity expired');
        if (frame.reason) blockers.push(frame.reason);
        if (context.routeKey !== encounter.routeKey)
            blockers.push('Route changed');
        if (encounter.passMethod === 'gps-plane') {
            if (
                presenceAheadMeters(
                    location,
                    presenceCoordinate(encounter.node),
                ) > 0
            )
                blockers.push('Camera is ahead of current travel direction');
        } else if (
            Math.cos(
                ((location?.heading - encounter.passedHeading) * Math.PI) / 180,
            ) < Math.cos(Math.PI / 6)
        )
            blockers.push('Heading changed more than 30 degrees');
        if (
            context.coverageComplete &&
            !presenceNodeIsIsolated(
                encounter.node,
                context.nodes ?? [],
                context.coverageComplete,
            )
        )
            blockers.push('Passed camera is no longer isolated');
    } else if (targets.length) {
        if (
            context.coverageComplete &&
            !targets.some((target) => target.isolated)
        )
            blockers.push('Nearby cameras are not isolated');
    } else blockers.push('No cameras in current inventory');
    return {
        capturedAt: new Date(now).toISOString(),
        phase,
        targetNodeId: encounter?.osmNodeId ?? null,
        secondsSincePass: encounter
            ? rounded((now - encounter.passedAt) / 1000)
            : null,
        blockers,
        pass,
        camera: context.cameraDiagnostics ?? null,
        location: {
            ageMs: rounded(age),
            accuracyMeters: rounded(location?.accuracy),
            speedMps: rounded(location?.speed),
            confidence: rounded(
                Number(match?.edgeMatchProbability ?? match?.confidence),
            ),
            matched: match?.isOffRoad === false,
        },
        path: {
            pointCount: context.coordinates?.length ?? 0,
            vehicleOffsetMeters: rounded(vehicle?.distanceFromRouteMeters),
            source: context.pathSource ?? 'unknown',
            navigationActive: context.navigationActive === true,
            maneuverSeconds:
                context.navigationActive === true
                    ? rounded(context.maneuverSeconds)
                    : null,
        },
        inventory: {
            status: context.inventoryStatus ?? 'unknown',
            source: context.inventorySource ?? 'unknown',
            retainedNodeCount: context.retainedNodeCount ?? 0,
            coverageRadiusMeters: rounded(context.coverageRadiusMeters),
            ageMs: rounded(context.inventoryAgeMs),
            distanceFromCenterMeters: rounded(context.inventoryDistanceMeters),
            coverageComplete: context.coverageComplete === true,
            nodeCount: context.nodes?.length ?? 0,
            targets,
        },
        frame: frame
            ? {
                  reason: frame.reason,
                  spanMeters: rounded(frame.spanMeters),
                  zoomLevel: rounded(frame.zoomLevel),
                  requiredCoverageMeters: rounded(frame.requiredCoverageMeters),
                  availableCoverageMeters: rounded(
                      frame.availableCoverageMeters,
                  ),
              }
            : null,
        viewport: {
            width: rounded(context.viewport?.visibleWidth),
            height: rounded(context.viewport?.visibleHeight),
        },
        limits: {
            available: Boolean(state),
            promptsThisDrive: state?.drive.count ?? null,
            globalCooldownSeconds:
                state?.lastPromptAt == null
                    ? 0
                    : Math.max(
                          0,
                          rounded(
                              (PRESENCE_POLICY.spacingMs -
                                  (now - state.lastPromptAt)) /
                                  1000,
                          ),
                      ),
            nodeCooldownSeconds:
                encounter && state?.nodeTimes[encounter.osmNodeId] !== undefined
                    ? Math.max(
                          0,
                          rounded(
                              (PRESENCE_POLICY.nodeCooldownMs -
                                  (now -
                                      state.nodeTimes[encounter.osmNodeId])) /
                                  1000,
                          ),
                      )
                    : 0,
            queuedReports: state?.outbox.length ?? null,
        },
    };
}

export function createPresenceDebugStore() {
    let value = { enabled: false, latest: null, events: [] };
    let lastPublishedAt = -Infinity;
    let lastDecision = '';
    const listeners = new Set();
    const emit = () => listeners.forEach((listener) => listener());
    const append = (event, at, details) =>
        [
            ...value.events,
            {
                at: new Date(at).toISOString(),
                event,
                ...(details ? { details } : {}),
            },
        ].slice(-60);
    return {
        getSnapshot: () => value,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setEnabled(enabled) {
            if (value.enabled === enabled) return;
            value = { ...value, enabled };
            lastPublishedAt = -Infinity;
            emit();
        },
        record(createSnapshot, now) {
            if (!value.enabled || now - lastPublishedAt < 1000) return;
            lastPublishedAt = now;
            const latest = createSnapshot();
            const target =
                latest.inventory.targets.find(
                    (node) => node.osmNodeId === latest.targetNodeId,
                ) ?? latest.inventory.targets[0];
            const nodeId = latest.targetNodeId ?? target?.osmNodeId ?? 'none';
            const decision = JSON.stringify([
                latest.phase,
                nodeId,
                latest.blockers,
                latest.pass?.reason,
            ]);
            const events =
                decision === lastDecision
                    ? value.events
                    : append(
                          `Node ${nodeId} · ${latest.phase}: ${latest.blockers.join('; ') || latest.pass?.reason || 'Eligible'} | road=${latest.location.confidence ?? '?'} GPS=${latest.location.accuracyMeters ?? '?'}m clearance=${latest.path.maneuverSeconds ?? '?'}s camera-offset=${target?.pathOffsetMeters ?? '?'}m`,
                          now,
                      );
            lastDecision = decision;
            value = { ...value, latest, events };
            emit();
        },
        event(event, now = Date.now(), details) {
            if (!value.enabled) return;
            value = {
                ...value,
                events: append(String(event).slice(0, 300), now, details),
            };
            emit();
        },
        clear() {
            value = { ...value, latest: null, events: [] };
            lastDecision = '';
            lastPublishedAt = -Infinity;
            emit();
        },
    };
}
export const presenceDebugStore = createPresenceDebugStore();
export const formatPresenceDebugSnapshot = (snapshot) =>
    JSON.stringify(
        { feature: 'CHR-7 ALPR confirmation', ...snapshot },
        null,
        2,
    );
