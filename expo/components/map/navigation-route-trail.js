import { getCoordinateDistanceMeters } from './geo';

const DETOUR_SAMPLE_SPACING_METERS = 5;

export function createNavigationRouteTrail(maximumFixGapMs) {
    let furthestProgress = null;
    let lastFix = null;
    let detourSegments = [];

    function reset() {
        furthestProgress = null;
        lastFix = null;
        detourSegments = [];
    }

    function record(location, progress, onRoute) {
        if (location.recordedAt === lastFix?.recordedAt) return;
        const coordinate = onRoute
            ? progress.coordinate
            : [location.longitude, location.latitude];
        if (onRoute) {
            detourSegments = [];
        } else {
            const continuous =
                lastFix &&
                !location.roadMatch?.isTeleport &&
                location.recordedAt - lastFix.recordedAt <= maximumFixGapMs;
            if (!continuous || !detourSegments.length) {
                detourSegments.push(continuous ? [lastFix.coordinate] : []);
            }
            const segment = detourSegments[detourSegments.length - 1];
            if (
                !segment.length ||
                getCoordinateDistanceMeters(segment.at(-1), coordinate) >=
                    DETOUR_SAMPLE_SPACING_METERS
            ) {
                segment.push(coordinate);
            }
        }
        lastFix = { coordinate, recordedAt: location.recordedAt };
        if (
            onRoute &&
            progress.alongRouteDistance >
                (furthestProgress?.alongRouteDistance ?? 0)
        ) {
            furthestProgress = progress;
        }
    }

    function snapshot(coordinates) {
        const segments = [];
        if (furthestProgress) {
            const { coordinate, coordinateIndex, segmentFraction } =
                furthestProgress;
            const prefix = coordinates.slice(0, coordinateIndex + 1);
            if (segmentFraction > 0) prefix.push(coordinate);
            if (prefix.length >= 2) segments.push(prefix);
        }
        for (const segment of detourSegments) {
            const samples = segment.slice();
            if (
                segment === detourSegments.at(-1) &&
                getCoordinateDistanceMeters(
                    samples.at(-1),
                    lastFix.coordinate,
                ) > 0
            ) {
                samples.push(lastFix.coordinate);
            }
            if (samples.length >= 2) segments.push(samples);
        }
        return segments;
    }

    return { record, reset, snapshot };
}
