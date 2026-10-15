import { geometryBounds } from './area-geometry.js';

export const AREA_BOUNDARIES_STORAGE_KEY = 'daf.area-boundaries.v1';

function boundaryRecord(area) {
    if (
        !Number.isSafeInteger(area?.id) ||
        area.id < 1 ||
        !['Polygon', 'MultiPolygon'].includes(area.geometry?.type) ||
        !Array.isArray(area.geometry.coordinates)
    )
        return null;
    let bounds;
    try {
        bounds = geometryBounds(area.geometry);
    } catch {
        return null;
    }
    if (
        !bounds?.every(Number.isFinite) ||
        bounds[0] >= bounds[2] ||
        bounds[1] >= bounds[3] ||
        bounds[0] < -180 ||
        bounds[2] > 180 ||
        bounds[1] < -90 ||
        bounds[3] > 90
    )
        return null;
    return {
        id: area.id,
        name: area.name,
        kind: area.kind,
        geometry: area.geometry,
        bounds,
    };
}

export function createAreaBoundaryCache({
    storage,
    hasDevice,
    onChange = () => {},
}) {
    let snapshot = [];
    let revision = 0;
    let pendingLoad;
    let writes = Promise.resolve();
    let persistedValue;

    function publish(areas) {
        revision++;
        const next = areas
            .map(boundaryRecord)
            .filter(Boolean)
            .slice(-25)
            .sort((a, b) => a.id - b.id);
        const value = JSON.stringify(next);
        if (value !== JSON.stringify(snapshot)) {
            snapshot = next;
            onChange(snapshot);
        }
        writes = writes
            .catch(() => {})
            .then(async () => {
                if (persistedValue === value) return;
                await storage.setItem(AREA_BOUNDARIES_STORAGE_KEY, value);
                persistedValue = value;
            });
        return writes;
    }

    return {
        all: () => snapshot,
        load() {
            if (pendingLoad) return pendingLoad;
            const startedAt = revision;
            pendingLoad = (async () => {
                if (!(await hasDevice())) {
                    if (revision === startedAt)
                        await storage.removeItem(AREA_BOUNDARIES_STORAGE_KEY);
                    return snapshot;
                }
                const value = await storage.getItem(
                    AREA_BOUNDARIES_STORAGE_KEY,
                );
                if (revision !== startedAt) return snapshot;
                try {
                    const areas = JSON.parse(value);
                    snapshot = Array.isArray(areas)
                        ? areas.map(boundaryRecord).filter(Boolean).slice(-25)
                        : [];
                } catch {
                    snapshot = [];
                }
                persistedValue = value;
                onChange(snapshot);
                return snapshot;
            })();
            return pendingLoad;
        },
        replace: publish,
        remember(area) {
            if (!boundaryRecord(area)) return Promise.resolve();
            return publish([
                ...snapshot.filter((item) => item.id !== area.id),
                area,
            ]);
        },
        remove(id) {
            return publish(snapshot.filter((area) => area.id !== Number(id)));
        },
    };
}
