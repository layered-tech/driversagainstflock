import assert from 'node:assert/strict';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
    normalizeMapboxImageScale,
    patchMapboxImageScale,
} = require('../../../plugins/withMapboxImageScale.js');
const source = readFileSync(
    new URL(
        '../../../node_modules/@rnmapbox/maps/ios/RNMBX/RNMBXImageQueue.swift',
        import.meta.url,
    ),
    'utf8',
);

test('normalizes every loaded UIImage to the requested density before Mapbox receives it', () => {
    const patched = normalizeMapboxImageScale(source);
    assert.match(patched, /let image = image, let cgImage = image.cgImage/);
    assert.match(
        patched,
        /UIImage\(cgImage: cgImage, scale: CGFloat\(weakSelf.scale\), orientation: image.imageOrientation\)/,
    );
    assert.match(patched, /completionHandler\(error, normalizedImage\)/);
    assert.equal(normalizeMapboxImageScale(patched), patched);
    assert.throws(
        () => normalizeMapboxImageScale('unexpected upstream source'),
        /Unable to find/,
    );
});

test('the prebuild patch writes only the iOS image queue and is repeatable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'daf-mapbox-density-'));
    const packageRoot = join(root, 'node_modules/@rnmapbox/maps');
    mkdirSync(join(packageRoot, 'ios/RNMBX'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(packageRoot, 'package.json'), '{"main":"index.js"}');
    writeFileSync(join(packageRoot, 'index.js'), '');
    const target = join(packageRoot, 'ios/RNMBX/RNMBXImageQueue.swift');
    writeFileSync(target, source);
    try {
        await patchMapboxImageScale(root);
        assert.equal(
            readFileSync(target, 'utf8'),
            normalizeMapboxImageScale(source),
        );
        await patchMapboxImageScale(root);
        assert.equal(
            readFileSync(target, 'utf8'),
            normalizeMapboxImageScale(source),
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the app registers the image density correction for native generation', () => {
    const config = require('../../../app.config.js');
    assert.ok(config.plugins.includes('./plugins/withMapboxImageScale'));
});
