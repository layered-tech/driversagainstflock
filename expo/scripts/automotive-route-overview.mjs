import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const finitePoint = (point) =>
    Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

export async function captureRouteOverviewBaseline(
    sample,
    pause = (ms) => new Promise((done) => setTimeout(done, ms)),
) {
    const deadline = Date.now() + 15000;
    let previous;
    while (Date.now() < deadline) {
        const snapshot = await sample();
        if (
            snapshot?.ready &&
            snapshot.zoom >= 14 &&
            !snapshot.previewVisible &&
            routeOverviewIsStable(previous, snapshot)
        )
            return snapshot;
        previous = snapshot;
        await pause(600);
    }
    throw new Error(
        'Driving camera did not settle before opening route choices',
    );
}

export function routeOverviewFailure(snapshot, baseline) {
    if (!snapshot?.ready) return snapshot?.error || 'Native map is not ready';
    if (!snapshot.previewVisible) return 'Route choices are not visible';
    if (!Number.isFinite(baseline?.zoom) || !Number.isFinite(snapshot.zoom))
        return 'Native camera zoom is unavailable';
    if (baseline.zoom - snapshot.zoom < 0.5)
        return `Camera did not zoom out from the driving view (${baseline.zoom} -> ${snapshot.zoom})`;
    const rect = snapshot.viewport?.visibleRect;
    if (!rect || !snapshot.boundsPoints || snapshot.boundsPoints.length !== 4)
        return 'Native route bounds are unavailable';
    if (
        !snapshot.boundsPoints.every(
            (point) =>
                finitePoint(point) &&
                point[0] >= rect.left - 3 &&
                point[0] <= rect.right + 3 &&
                point[1] >= rect.top - 3 &&
                point[1] <= rect.bottom + 3,
        )
    )
        return 'Camera does not contain all route choices in the visible map';
    if (
        !snapshot.routeKey ||
        !snapshot.renderedRouteKeys?.includes(snapshot.routeKey)
    )
        return 'Selected route line is missing from the native rendered map';
    if (
        !snapshot.routePoints?.every(finitePoint) ||
        snapshot.routePoints.length < 10
    )
        return 'Native route screen coordinates are unavailable';
    return null;
}

export function routeOverviewIsStable(previous, current) {
    return (
        Boolean(previous) &&
        previous?.routeKey === current.routeKey &&
        JSON.stringify(previous?.routeBounds) ===
            JSON.stringify(current.routeBounds) &&
        previous?.viewport?.key === current.viewport?.key &&
        Math.abs(previous.zoom - current.zoom) < 0.05 &&
        finitePoint(previous?.center) &&
        finitePoint(current.center) &&
        Math.hypot(
            previous.center[0] - current.center[0],
            previous.center[1] - current.center[1],
        ) < 0.00005
    );
}

export function makeRoutePixelProbe(snapshot, appBounds) {
    const { width, height, visibleRect } = snapshot.viewport;
    const scaleX = appBounds.width / width;
    const scaleY = appBounds.height / height;
    return {
        color: snapshot.routeKey === 'ideal' ? [31, 191, 107] : [46, 139, 255],
        radius: Math.ceil(Math.max(scaleX, scaleY) * 4),
        points: snapshot.routePoints
            .filter(
                ([x, y]) =>
                    x > visibleRect.left + 8 &&
                    x < visibleRect.right - 8 &&
                    y > visibleRect.top + 8 &&
                    y < visibleRect.bottom - 8,
            )
            .map(([x, y]) => [
                appBounds.x + x * scaleX,
                appBounds.y + y * scaleY,
            ]),
    };
}

// Both runners use the same gate. A Start/Back step cannot run until native
// bounds, rendered features and actual route-colored screenshot pixels agree.
export async function assertRouteOverview({
    name,
    evidenceName = name,
    baseline,
    sample,
    capture,
    appBounds,
    runPixelProbe,
    directory,
    report,
    now = Date.now,
    pause = (ms) => new Promise((done) => setTimeout(done, ms)),
    timeout = 30000,
}) {
    const deadline = now() + timeout;
    const samples = [];
    let stableSince = null;
    let previous = null;
    let failure = 'No overview samples';
    while (now() < deadline) {
        const snapshot = await sample();
        failure = routeOverviewFailure(snapshot, baseline);
        let pixels = null;
        if (!failure) {
            const shot = await capture(name);
            const probe = makeRoutePixelProbe(snapshot, appBounds(shot));
            pixels = await runPixelProbe(shot, probe);
            if (
                probe.points.length < 10 ||
                !Number.isFinite(pixels?.matched) ||
                !Number.isFinite(pixels?.span) ||
                pixels.matched < 10 ||
                pixels.matched > probe.points.length ||
                pixels.matched / probe.points.length < 0.55 ||
                pixels.span < 60
            )
                failure =
                    'Selected route line is not visibly drawn along its projected path';
        }
        samples.push({ at: now(), snapshot, pixels, failure });
        writeFileSync(
            join(directory, `${evidenceName}-overview.json`),
            JSON.stringify({ baseline, samples }, null, 2),
        );
        if (!failure) {
            if (!previous || !routeOverviewIsStable(previous, snapshot))
                stableSince = now();
            if (stableSince !== null && now() - stableSince >= 1500) {
                report(
                    `Route overview verified: zoom ${baseline.zoom.toFixed(2)} -> ${snapshot.zoom.toFixed(2)}, visible route line, camera stable for ${now() - stableSince}ms`,
                );
                return;
            }
            previous = snapshot;
        } else {
            stableSince = null;
            previous = null;
        }
        await pause(350);
    }
    throw new Error(
        `Route overview failed: ${failure || 'camera did not settle'}`,
    );
}
