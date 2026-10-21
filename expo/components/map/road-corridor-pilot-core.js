const METERS_PER_DEGREE = 111000;

function insideRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x, y] = ring[i],
            [px, py] = ring[j];
        if (
            y > point[1] !== py > point[1] &&
            point[0] < ((px - x) * (point[1] - y)) / (py - y) + x
        )
            inside = !inside;
    }
    return inside;
}

export function selectCorridorTiles(catalog, location, radiusMeters = 3200) {
    const point = [location?.longitude, location?.latitude];
    if (!point.every(Number.isFinite)) throw new Error('Location unavailable');
    // Include the session's 1.2 km refresh interval and an extra safety margin.
    const margin = radiusMeters + 1700;
    const scaleX = METERS_PER_DEGREE * Math.cos((point[1] * Math.PI) / 180);
    const polygon = catalog.coverage.find(
        (rings) =>
            insideRing(point, rings[0]) &&
            !rings.slice(1).some((ring) => insideRing(point, ring)),
    );
    if (!polygon)
        throw new Error(
            catalog.region ? 'Outside extract' : 'Outside Wisconsin extract',
        );
    for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i],
                b = ring[(i + 1) % ring.length];
            const ax = (a[0] - point[0]) * scaleX,
                ay = (a[1] - point[1]) * METERS_PER_DEGREE;
            const dx = (b[0] - a[0]) * scaleX,
                dy = (b[1] - a[1]) * METERS_PER_DEGREE;
            const t = Math.max(
                0,
                Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
            );
            if (Math.hypot(ax + t * dx, ay + t * dy) < margin)
                throw new Error('Near extract boundary');
        }
    }
    const west = point[0] - radiusMeters / scaleX,
        east = point[0] + radiusMeters / scaleX;
    const south = point[1] - radiusMeters / METERS_PER_DEGREE,
        north = point[1] + radiusMeters / METERS_PER_DEGREE;
    const byId = new Map(catalog.tiles.map((tile) => [tile.id, tile]));
    const tiles = [];
    for (let x = Math.ceil(west * 10) - 1; x <= Math.floor(east * 10); x++) {
        for (
            let y = Math.ceil(south * 10) - 1;
            y <= Math.floor(north * 10);
            y++
        ) {
            const tile = byId.get(`${x}_${y}`);
            if (!tile) throw new Error('Required tile missing');
            tiles.push(tile);
        }
    }
    return tiles;
}

export function roadIntersectsCorridor(way, location, radiusMeters = 3200) {
    const dx =
        radiusMeters /
        (METERS_PER_DEGREE * Math.cos((location.latitude * Math.PI) / 180));
    const dy = radiusMeters / METERS_PER_DEGREE;
    return way.coordinates.some((point, index, coordinates) => {
        if (!index) return false;
        const previous = coordinates[index - 1];
        return (
            Math.max(point[0], previous[0]) >= location.longitude - dx &&
            Math.min(point[0], previous[0]) <= location.longitude + dx &&
            Math.max(point[1], previous[1]) >= location.latitude - dy &&
            Math.min(point[1], previous[1]) <= location.latitude + dy
        );
    });
}

export async function loadPilotCorridor({
    catalog,
    location,
    radiusMeters,
    signal,
    loadTile,
    normalize,
    service,
}) {
    let reason;
    try {
        const tiles = selectCorridorTiles(catalog, location, radiusMeters);
        const ways = new Map();
        // Sequential loading bounds decompression and parsing memory.
        for (const tile of tiles) {
            const records = await loadTile(tile, signal);
            if (records.length !== tile.record_count)
                throw new Error('Tile validation failed');
            for (const record of records) {
                const way = normalize(record);
                if (!way) throw new Error('Tile validation failed');
                if (roadIntersectsCorridor(way, location, radiusMeters))
                    ways.set(way.id, way);
            }
        }
        if (!ways.size) throw new Error('No downloaded roads');
        if (signal?.aborted)
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        const result = [...ways.values()];
        Object.defineProperty(result, 'corridorSource', {
            value: { source: 'download', reason: null },
        });
        return result;
    } catch (error) {
        if (signal?.aborted) throw error;
        reason =
            error?.name === 'AbortError'
                ? 'Download timed out'
                : error?.message || 'Downloaded tiles unavailable';
    }
    const ways = await service({ location, radiusMeters, signal });
    Object.defineProperty(ways, 'corridorSource', {
        value: { source: 'service', reason },
    });
    return ways;
}
