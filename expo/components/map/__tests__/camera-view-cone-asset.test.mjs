import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
    copyCameraViewConeAsset,
} = require('../../../plugins/withCameraViewConeAsset.js');

test('Android prebuild packages the exact GLB addressed by the model URI', async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const android = await mkdtemp(path.join(tmpdir(), 'daf-cone-'));
    try {
        await copyCameraViewConeAsset(root, android);
        await copyCameraViewConeAsset(root, android);
        assert.deepEqual(
            await readFile(
                path.join(android, 'app/src/main/assets/camera-view-cone.glb'),
            ),
            await readFile(path.join(root, 'assets/map/camera-view-cone.glb')),
        );
        const config = require('../../../app.config.js');
        assert.ok(config.plugins.includes('./plugins/withCameraViewConeAsset'));
    } finally {
        await rm(android, { recursive: true, force: true });
    }
});
