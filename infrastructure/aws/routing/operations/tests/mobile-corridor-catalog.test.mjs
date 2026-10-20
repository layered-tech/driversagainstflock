import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareMobileCorridor } from '../prepare-mobile-corridor.mjs';

const pilot = JSON.parse(
    readFileSync(
        new URL(
            '../../../../../expo/assets/map/wisconsin-corridor.json',
            import.meta.url,
        ),
    ),
);
const manifest = {
    schema_version: 1,
    region: 'wisconsin',
    release_id: pilot.release,
    tiles: pilot.tiles,
};
test('prepares the real Wisconsin catalog without expanding the extract coverage', () => {
    const result = prepareMobileCorridor(manifest, {
        type: 'MultiPolygon',
        coordinates: pilot.coverage,
    });
    assert.deepEqual(result, { schema_version: 1, ...pilot });
});
test('rejects incompatible exports and bounding boxes used in place of actual coverage', () => {
    assert.throws(() =>
        prepareMobileCorridor({ ...manifest, schema_version: 2 }, {}),
    );
    assert.throws(() =>
        prepareMobileCorridor(manifest, {
            type: 'bbox',
            coordinates: [-90, 40, -80, 50],
        }),
    );
});
