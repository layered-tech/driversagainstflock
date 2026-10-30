import { APP_ENVIRONMENT } from './config';
import {
    getDirectionsRouteOptionsBounds,
    getSelectedDirectionsRouteOption,
} from './directions';

// Sample by distance rather than vertex count so long straight roads also
// contribute to the screenshot proof.
export function sampleRouteCoordinates(coordinates, count = 49) {
    if (!coordinates || coordinates.length < 2) return [];
    const lengths = [0];
    for (let index = 1; index < coordinates.length; index++) {
        const previous = coordinates[index - 1];
        const current = coordinates[index];
        lengths.push(
            lengths.at(-1) +
                Math.hypot(
                    (current[0] - previous[0]) *
                        Math.cos((current[1] * Math.PI) / 180),
                    current[1] - previous[1],
                ),
        );
    }
    if (!lengths.at(-1)) return [];
    let segment = 1;
    return Array.from({ length: count }, (_, index) => {
        const distance = (lengths.at(-1) * index) / (count - 1);
        while (segment < lengths.length - 1 && lengths[segment] < distance)
            segment++;
        const fraction =
            (distance - lengths[segment - 1]) /
            (lengths[segment] - lengths[segment - 1] || 1);
        return coordinates[segment].map(
            (value, axis) =>
                coordinates[segment - 1][axis] +
                (value - coordinates[segment - 1][axis]) * fraction,
        );
    });
}

export async function getAutomotiveE2EMapSnapshot({
    mapView,
    route,
    previewVisible,
    viewport,
}) {
    if (APP_ENVIRONMENT !== 'e2e') return null;
    if (!mapView) return { ready: false };
    try {
        const [zoom, center, visibleBounds] = await Promise.all([
            mapView.getZoom(),
            mapView.getCenter(),
            mapView.getVisibleBounds(),
        ]);
        const snapshot = {
            ready: true,
            previewVisible,
            zoom,
            center,
            visibleBounds,
            viewport,
        };
        if (!previewVisible || !route) return snapshot;
        const selected = getSelectedDirectionsRouteOption(route);
        const routeBounds = getDirectionsRouteOptionsBounds(route);
        const { ne, sw } = routeBounds;
        const [features, boundsPoints, routePoints] = await Promise.all([
            mapView.queryRenderedFeaturesInRect(
                [],
                [],
                ['directions-route-line'],
            ),
            Promise.all(
                [ne, sw, [ne[0], sw[1]], [sw[0], ne[1]]].map((coordinate) =>
                    mapView.getPointInView(coordinate),
                ),
            ),
            Promise.all(
                sampleRouteCoordinates(selected?.coordinates).map(
                    (coordinate) => mapView.getPointInView(coordinate),
                ),
            ),
        ]);
        return {
            ...snapshot,
            routeKey: selected?.routeKey,
            routeBounds,
            boundsPoints,
            routePoints,
            renderedRouteKeys: (features?.features ?? [])
                .filter(({ properties }) => properties?.selected === true)
                .map(({ properties }) => properties.routeKey),
        };
    } catch (error) {
        return { ready: false, error: error.message };
    }
}
