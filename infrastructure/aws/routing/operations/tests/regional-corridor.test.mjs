import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markRegionalValidationArtifact } from '../mark-regional-corridor.mjs';

test('regional sources cannot claim verified buffered coverage', () => {
    const manifest = {
        source: { md5: 'original' },
        coverage: {
            bounds: [-93, 42, -86, 48],
            method: 'state-bounding-box-plus-at-least-10km',
        },
    };
    const provenance = {
        url: 'https://data.bbbike.org/source.osm.pbf',
        sha256: 'a'.repeat(64),
        sourceBounds: [-92.9, 42.5, -86.2, 47.4],
        snapshot: '2026-10-19T00:00:00Z',
    };
    const marked = markRegionalValidationArtifact(manifest, provenance);
    assert.equal(marked.validation_only, true);
    assert.equal(marked.coverage.border_buffer_verified, false);
    assert.equal(marked.coverage.bounds_are_guaranteed_coverage, false);
    assert.equal(marked.source.md5, 'original');
    assert.equal(
        manifest.coverage.method,
        'state-bounding-box-plus-at-least-10km',
    );
    assert.throws(() =>
        markRegionalValidationArtifact(manifest, {
            ...provenance,
            sha256: 'bad',
        }),
    );
});
