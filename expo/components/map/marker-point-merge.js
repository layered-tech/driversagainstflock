function getMarkerPointId(markerPoint) {
    const markerId = markerPoint?.properties?.id ?? markerPoint?.id;

    return markerId === null || markerId === undefined ? '' : String(markerId);
}

export function upsertMarkerPointList(currentPoints, incomingPoints) {
    const current = Array.isArray(currentPoints) ? currentPoints : [];
    const incoming = Array.isArray(incomingPoints) ? incomingPoints : [];
    const incomingById = new Map();

    for (const markerPoint of incoming) {
        const markerId = getMarkerPointId(markerPoint);

        if (markerId) {
            incomingById.set(markerId, markerPoint);
        }
    }

    const mergedPoints = current.map((markerPoint) => {
        const markerId = getMarkerPointId(markerPoint);

        if (!markerId || !incomingById.has(markerId)) {
            return markerPoint;
        }

        const replacement = incomingById.get(markerId);

        incomingById.delete(markerId);

        return replacement;
    });

    return [...mergedPoints, ...incomingById.values()];
}
