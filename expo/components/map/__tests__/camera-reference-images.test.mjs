import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CAMERA_MANUFACTURERS } from '../../../lib/osm/camera-manufacturers.js';
import { loadTourModule } from './tour-test-helpers.mjs';

test('every gallery photo is bundled locally with no repeated photo per manufacturer', () => {
    const references = CAMERA_MANUFACTURERS.flatMap(
        ({ referenceImages }) => referenceImages,
    );
    const mocks = Object.fromEntries(
        references.map((name) => [`../../assets/camera-presets/${name}`, name]),
    );
    const { CAMERA_REFERENCE_IMAGES } = loadTourModule(
        new URL('../../contribute/camera-reference-images.js', import.meta.url),
        mocks,
    );
    assert.equal(references.length, 23);
    assert.equal(
        Object.keys(CAMERA_REFERENCE_IMAGES).length,
        references.length,
    );
    for (const { value, referenceImages } of CAMERA_MANUFACTURERS) {
        const hashes = referenceImages.map((name) => {
            assert.doesNotMatch(name, /https?:|\/\//);
            assert.equal(CAMERA_REFERENCE_IMAGES[name], name);
            const data = readFileSync(
                new URL(
                    `../../../assets/camera-presets/${name}`,
                    import.meta.url,
                ),
            );
            const header = data.subarray(0, 12);
            assert.ok(
                header.toString('hex').startsWith('ffd8ff') ||
                    header.toString('hex').startsWith('89504e470d0a1a0a') ||
                    (header.toString('ascii', 0, 4) === 'RIFF' &&
                        header.toString('ascii', 8, 12) === 'WEBP'),
                name,
            );
            return createHash('sha256').update(data).digest('hex');
        });
        assert.equal(
            new Set(hashes).size,
            hashes.length,
            `${value} has duplicate images`,
        );
    }
});
