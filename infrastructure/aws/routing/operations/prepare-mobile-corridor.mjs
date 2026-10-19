import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateCorridorCatalog } from '../../../../expo/components/map/road-corridor-releases.js';

// Coverage must describe the actual extract, including holes, not its bounding box.
export function prepareMobileCorridor(manifest, geometry) {
    if (manifest.schema_version !== 1 || manifest.region !== 'wisconsin') {
        throw new Error('Unsupported export manifest');
    }
    const coverage =
        geometry.type === 'Polygon'
            ? [geometry.coordinates]
            : geometry.type === 'MultiPolygon'
              ? geometry.coordinates
              : null;
    return validateCorridorCatalog({
        schema_version: 1,
        release: manifest.release_id,
        coverage,
        tiles: manifest.tiles,
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const [manifestPath, coveragePath, outputPath] = process.argv.slice(2);
    if (!manifestPath || !coveragePath || !outputPath) {
        throw new Error(
            'Usage: node prepare-mobile-corridor.mjs MANIFEST ACTUAL_COVERAGE_GEOJSON OUTPUT/mobile-catalog.json',
        );
    }
    const catalog = prepareMobileCorridor(
        JSON.parse(readFileSync(manifestPath)),
        JSON.parse(readFileSync(coveragePath)),
    );
    // Keep immutable releases immutable; upload beside the independently validated manifest.
    writeFileSync(outputPath, JSON.stringify(catalog), { flag: 'wx' });
}
