import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const REGION_DEGREES = 2;
export const REGION_HALO_DEGREES = 0.3;

export function createRegionalCatalogs(manifest) {
    assert.equal(manifest.region, 'us');
    const groups = new Map();
    for (const tile of manifest.tiles) {
        const [x, y] = tile.id.split('_').map(Number);
        assert.ok(
            Number.isInteger(x) &&
                Number.isInteger(y) &&
                x >= -1800 &&
                x < 1800 &&
                y >= -900 &&
                y < 900,
        );
        // Include neighboring tiles before the driver reaches a region boundary.
        for (
            let rx = Math.max(-90, Math.floor((x - 3) / 20));
            rx <= Math.min(89, Math.floor((x + 4) / 20));
            rx++
        ) {
            for (
                let ry = Math.max(-45, Math.floor((y - 3) / 20));
                ry <= Math.min(44, Math.floor((y + 4) / 20));
                ry++
            ) {
                const region = `${rx}_${ry}`;
                if (!groups.has(region)) groups.set(region, []);
                groups.get(region).push(tile);
            }
        }
    }
    const catalogs = new Map(),
        regions = {};
    for (const [region, tiles] of [...groups].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
    )) {
        const [x, y] = region.split('_').map(Number);
        const west = Math.max(-180, x * 2 - REGION_HALO_DEGREES),
            south = Math.max(-90, y * 2 - REGION_HALO_DEGREES),
            east = Math.min(180, (x + 1) * 2 + REGION_HALO_DEGREES),
            north = Math.min(90, (y + 1) * 2 + REGION_HALO_DEGREES);
        const catalog = {
            schema_version: 1,
            release: manifest.release_id,
            region,
            coverage: [
                [
                    [
                        [west, south],
                        [east, south],
                        [east, north],
                        [west, north],
                        [west, south],
                    ],
                ],
            ],
            tiles,
        };
        const bytes = Buffer.from(JSON.stringify(catalog));
        assert.ok(bytes.length < 900000, `Catalog too large: ${region}`);
        catalogs.set(region, { catalog, bytes });
        regions[region] = { sha256: hash(bytes), size_bytes: bytes.length };
    }
    assert.ok(catalogs.size > 0);
    const index = {
        schema_version: 2,
        release: manifest.release_id,
        region_degrees: REGION_DEGREES,
        halo_degrees: REGION_HALO_DEGREES,
        regions,
    };
    const bytes = Buffer.from(JSON.stringify(index));
    assert.ok(bytes.length < 900000, 'National index too large');
    return { index, bytes, catalogs };
}

export function assertNationalCoverage(manifest) {
    const ids = new Set(manifest.tiles.map((tile) => tile.id));
    for (const [name, longitude, latitude] of [
        ['Seattle', -122.33, 47.6],
        ['Los Angeles', -118.24, 34.05],
        ['New York', -73.99, 40.71],
        ['Chicago', -87.63, 41.88],
        ['Dallas', -96.8, 32.78],
        ['Anchorage', -149.9, 61.22],
        ['Honolulu', -157.86, 21.31],
    ]) {
        assert.ok(
            ids.has(
                `${Math.floor(longitude * 10)}_${Math.floor(latitude * 10)}`,
            ),
            `Missing national coverage: ${name}`,
        );
    }
}
