import assert from 'node:assert/strict';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// A regional source cannot certify the national source's buffered coverage.
export function markRegionalValidationArtifact(
    manifest,
    { url, sha256, sourceBounds, snapshot },
) {
    assert.equal(new URL(url).protocol, 'https:');
    assert.match(sha256, /^[a-f0-9]{64}$/);
    assert.equal(sourceBounds.length, 4);
    assert.ok(sourceBounds.every(Number.isFinite));
    assert.ok(
        sourceBounds[0] < sourceBounds[2] && sourceBounds[1] < sourceBounds[3],
    );
    assert.ok(Number.isFinite(Date.parse(snapshot)));
    return {
        ...manifest,
        validation_only: true,
        source: {
            ...manifest.source,
            url,
            sha256,
            snapshot,
            bounds: sourceBounds,
        },
        coverage: {
            ...manifest.coverage,
            method: 'source-extract-intersected-with-requested-bounds',
            border_buffer_verified: false,
            bounds_are_guaranteed_coverage: false,
        },
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const [manifestPath, provenancePath] = process.argv.slice(2);
    assert.ok(
        manifestPath && provenancePath,
        'Usage: node mark-regional-corridor.mjs MANIFEST PROVENANCE',
    );
    const updated = markRegionalValidationArtifact(
        JSON.parse(readFileSync(manifestPath)),
        JSON.parse(readFileSync(provenancePath)),
    );
    writeFileSync(
        `${manifestPath}.partial`,
        JSON.stringify(updated, null, 2) + '\n',
    );
    renameSync(`${manifestPath}.partial`, manifestPath);
}
