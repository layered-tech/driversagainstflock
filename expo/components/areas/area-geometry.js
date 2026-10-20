export const AREA_KINDS = {
    city: 'City',
    county: 'County',
    zip: 'ZIP',
    radius: 'Radius',
    drawn: 'Drawn',
};
export const ALERT_MODES = [
    {
        value: 'instant',
        label: 'Instant',
        description: 'A push for every change',
    },
    {
        value: 'daily',
        label: 'Daily digest',
        description: 'One summary each morning',
    },
    {
        value: 'weekly',
        label: 'Weekly digest',
        description: 'One summary every Monday',
    },
    {
        value: 'off',
        label: 'In-app only',
        description: 'No pushes. Just the badge.',
    },
];
export function circleGeometry(center, miles) {
    if (
        !Array.isArray(center) ||
        center.length !== 2 ||
        !center.every(Number.isFinite) ||
        Math.abs(center[0]) > 180 ||
        Math.abs(center[1]) > 85 ||
        !Number.isFinite(miles) ||
        miles < 1 ||
        miles > 25
    )
        return null;
    const radians = Math.PI / 180;
    const lat = center[1] * radians;
    const lng = center[0] * radians;
    const distance = (miles * 1609.344) / 6371008.8;
    const ring = Array.from({ length: 64 }, (_, index) => {
        const bearing = (index * 2 * Math.PI) / 64;
        const nextLat = Math.asin(
            Math.sin(lat) * Math.cos(distance) +
                Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
        );
        const nextLng =
            lng +
            Math.atan2(
                Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
                Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat),
            );
        return [((nextLng / radians + 540) % 360) - 180, nextLat / radians];
    });
    // Split circles at the date line to avoid a polygon spanning the world.
    if (
        ring.some(
            (point, index) =>
                index && Math.abs(point[0] - ring[index - 1][0]) > 180,
        )
    )
        return null;
    return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}
export function drawnGeometry(points) {
    return points.length >= 3
        ? { type: 'Polygon', coordinates: [[...points, points[0]]] }
        : null;
}
export function geometryBounds(geometry) {
    if (!geometry) return null;
    const points =
        geometry.type === 'MultiPolygon'
            ? geometry.coordinates.flat(2)
            : geometry.coordinates.flat();
    if (!points.length) return null;
    return points.reduce(
        (bounds, [x, y]) => [
            Math.min(bounds[0], x),
            Math.min(bounds[1], y),
            Math.max(bounds[2], x),
            Math.max(bounds[3], y),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
    );
}
export function geometrySquareMiles(geometry) {
    if (!geometry) return 0;
    const polygons =
        geometry.type === 'MultiPolygon'
            ? geometry.coordinates
            : [geometry.coordinates];
    const radians = Math.PI / 180;
    const ringArea = (ring) =>
        Math.abs(
            (ring
                .slice(1)
                .reduce(
                    (sum, point, index) =>
                        sum +
                        (point[0] - ring[index][0]) *
                            radians *
                            (2 +
                                Math.sin(ring[index][1] * radians) +
                                Math.sin(point[1] * radians)),
                    0,
                ) *
                6371008.8 ** 2) /
                2,
        );
    return (
        polygons.reduce(
            (total, polygon) =>
                total +
                ringArea(polygon[0]) -
                polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0),
            0,
        ) / 2589988.110336
    );
}
export function notificationRoute(data) {
    const validId = (id) =>
        /^(?:[1-9]\d*)$/.test(String(id)) && Number.isSafeInteger(Number(id));
    if (!validId(data?.area_id)) return null;
    return validId(data?.change_id)
        ? `/areas/${data.area_id}/change?changeId=${data.change_id}`
        : `/areas/${data.area_id}`;
}
export function mergeAreaChanges(current, incoming) {
    return [
        ...new Map(
            [...current, ...incoming].map((change) => [change.id, change]),
        ).values(),
    ];
}
