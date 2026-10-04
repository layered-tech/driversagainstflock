import { getAutomotiveAlertDistanceMeters } from '../components/map/automotive-alert-policy.js';

const KNOTS_PER_METER_PER_SECOND = 1 / 0.514444;

function bearing(from, to) {
    const radians = (value) => (value * Math.PI) / 180;
    const longitudeDelta = radians(to[0] - from[0]);
    const latitude = radians(from[1]);
    const nextLatitude = radians(to[1]);
    return (
        ((Math.atan2(
            Math.sin(longitudeDelta) * Math.cos(nextLatitude),
            Math.cos(latitude) * Math.sin(nextLatitude) -
                Math.sin(latitude) *
                    Math.cos(nextLatitude) *
                    Math.cos(longitudeDelta),
        ) *
            180) /
            Math.PI +
            360) %
        360
    );
}

function coordinate(point) {
    const value = [point?.lng, point?.lat];
    if (
        !value.every(Number.isFinite) ||
        Math.abs(value[0]) > 180 ||
        Math.abs(value[1]) > 90
    ) {
        throw new Error('Saved emulator route contains an invalid coordinate.');
    }
    return value;
}

/** Google routes store geometry and estimated durations, not recorded GPS fixes. */
export function parseEmulatorRoute(data) {
    const route = data?.routes?.[0];
    if (!route?.legs?.length) {
        throw new Error(
            'Expected a saved Google emulator route with timed legs.',
        );
    }
    const points = [];
    let elapsedMs = 0;
    for (const leg of route.legs) {
        const durationMs = leg.duration?.value * 1000;
        const coordinates = leg.steps?.flatMap((step) =>
            (step.path ?? []).map(coordinate),
        );
        if (
            !Number.isFinite(durationMs) ||
            durationMs <= 0 ||
            coordinates?.length < 2 ||
            !coordinates
        ) {
            throw new Error(
                'Saved emulator route needs detailed step paths and a positive duration.',
            );
        }
        const distances = coordinates.map((point, index) =>
            index === 0
                ? 0
                : getAutomotiveAlertDistanceMeters(
                      coordinates[index - 1],
                      point,
                  ),
        );
        const distanceMeters = distances.reduce((sum, value) => sum + value, 0);
        if (distanceMeters <= 0) {
            throw new Error('Saved emulator route does not contain movement.');
        }
        let traveledMeters = 0;
        for (const [index, point] of coordinates.entries()) {
            traveledMeters += distances[index];
            const atMs =
                elapsedMs + (traveledMeters / distanceMeters) * durationMs;
            if (points.at(-1)?.atMs === atMs) continue;
            points.push({ coordinate: point, atMs });
        }
        elapsedMs += durationMs;
    }
    return {
        name: route.summary ?? 'Saved emulator route',
        coordinates: points.map((point) => point.coordinate),
        points,
        durationMs: elapsedMs,
    };
}

export function getEmulatorRouteFix(route, atMs) {
    if (!Number.isFinite(atMs) || atMs < 0 || atMs > route.durationMs) {
        throw new Error('GPS replay time is outside the saved route.');
    }
    const endIndex = Math.max(
        1,
        route.points.findIndex((point) => point.atMs > atMs),
    );
    const end =
        atMs === route.durationMs
            ? route.points.at(-1)
            : route.points[endIndex];
    const start =
        atMs === route.durationMs
            ? route.points.at(-2)
            : route.points[endIndex - 1];
    const progress = (atMs - start.atMs) / (end.atMs - start.atMs);
    const speed =
        atMs === route.durationMs
            ? 0
            : getAutomotiveAlertDistanceMeters(
                  start.coordinate,
                  end.coordinate,
              ) /
              ((end.atMs - start.atMs) / 1000);
    return {
        atMs,
        longitude:
            start.coordinate[0] +
            (end.coordinate[0] - start.coordinate[0]) * progress,
        latitude:
            start.coordinate[1] +
            (end.coordinate[1] - start.coordinate[1]) * progress,
        heading: bearing(start.coordinate, end.coordinate),
        speed,
        velocityKnots: speed * KNOTS_PER_METER_PER_SECOND,
    };
}

export function buildEmulatorRouteReplay(
    route,
    { fromMs = 0, toMs = route.durationMs, intervalMs = 1000 } = {},
) {
    if (
        !Number.isFinite(intervalMs) ||
        intervalMs <= 0 ||
        !Number.isFinite(fromMs) ||
        !Number.isFinite(toMs) ||
        fromMs < 0 ||
        toMs > route.durationMs ||
        toMs < fromMs
    ) {
        throw new Error('Invalid saved-route replay range or interval.');
    }
    const fixes = [];
    for (let atMs = fromMs; atMs < toMs; atMs += intervalMs) {
        fixes.push(getEmulatorRouteFix(route, atMs));
    }
    fixes.push(getEmulatorRouteFix(route, toMs));
    return fixes;
}

/** Schedule against elapsed time so ADB execution does not accumulate GPS drift. */
export async function replayEmulatorRoute(
    fixes,
    { sendFix, wait, now = performance.now.bind(performance) },
) {
    const startedAt = now();
    for (const fix of fixes) {
        const remainingMs = fix.atMs - fixes[0].atMs - (now() - startedAt);
        if (remainingMs > 0) await wait(remainingMs);
        await sendFix(fix);
    }
}
