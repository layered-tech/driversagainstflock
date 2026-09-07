export function filterQuery(filters) {
    return Object.fromEntries(
        Object.entries(filters).filter(
            ([, value]) =>
                value !== '' &&
                value !== null &&
                value !== undefined &&
                value !== false &&
                (!Array.isArray(value) || value.length),
        ),
    );
}
export function boundsGeometry(text) {
    const values = text
        .trim()
        .split(/[\s,→]+/)
        .filter(Boolean)
        .map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
        throw new Error('Enter four coordinates: south, west, north, east.');
    const [south, west, north, east] = values;
    if (
        south >= north ||
        west >= east ||
        south < -90 ||
        north > 90 ||
        west < -180 ||
        east > 180
    )
        throw new Error(
            'Use valid bounds with south below north and west below east.',
        );
    return {
        type: 'Polygon',
        coordinates: [
            [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ],
        ],
    };
}
export function drawnGeometry(points) {
    if (points.length < 3)
        throw new Error('Add at least three points to draw a boundary.');
    return { type: 'Polygon', coordinates: [[...points, points[0]]] };
}
export function absoluteTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'UTC',
              timeZoneName: 'short',
          }).format(date);
}
export function locationLabel(row) {
    if (row.tags?.['addr:city']) return row.tags['addr:city'];
    if (row.latitude != null && row.longitude != null)
        return `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`;
    if (row.bounds?.length === 4 && row.bounds.every((value) => value != null))
        return `${((row.bounds[1] + row.bounds[3]) / 2).toFixed(3)}, ${((row.bounds[0] + row.bounds[2]) / 2).toFixed(3)}`;
    return 'Location unavailable';
}

export function relativeTime(value, now = Date.now()) {
    if (!value) return '—';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '—';
    const elapsed = Math.max(0, now - timestamp);
    if (elapsed < 60_000) return 'now';
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
    return `${Math.floor(elapsed / 86_400_000)}d ago`;
}
