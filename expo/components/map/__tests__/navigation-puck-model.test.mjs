import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const navigationModuleDirectory = path.resolve(
    testDirectory,
    '../../../mapbox-navigation',
);

async function readGlb(relativePath) {
    const buffer = await readFile(
        path.join(navigationModuleDirectory, relativePath),
    );
    const jsonChunkLength = buffer.readUInt32LE(12);
    const document = JSON.parse(
        buffer
            .subarray(20, 20 + jsonChunkLength)
            .toString()
            .trim(),
    );
    const binaryChunkOffset = 20 + jsonChunkLength + 8;

    return { buffer, binaryChunkOffset, document };
}

function verticalBounds(model, materialName) {
    const materialIndex = model.document.materials.findIndex(
        (material) => material.name === materialName,
    );
    const primitive = model.document.meshes[0].primitives.find(
        (candidate) => candidate.material === materialIndex,
    );
    const accessor = model.document.accessors[primitive.attributes.POSITION];
    const bufferView = model.document.bufferViews[accessor.bufferView];
    const positionOffset =
        model.binaryChunkOffset +
        bufferView.byteOffset +
        (accessor.byteOffset ?? 0);
    const verticalPositions = Array.from(
        { length: accessor.count },
        (_, index) => model.buffer.readFloatLE(positionOffset + index * 12 + 4),
    );

    return {
        maximum: Math.max(...verticalPositions),
        minimum: Math.min(...verticalPositions),
    };
}

test('navigation puck face stays level with its white border', async () => {
    const iosModel = await readGlb('ios/navigation_puck.glb');
    const androidModel = await readGlb(
        'android/src/main/assets/navigation_puck.glb',
    );
    const borderTop = verticalBounds(iosModel, 'White border top');
    const borderThickness = verticalBounds(iosModel, 'White border thickness');
    const blueFace = verticalBounds(iosModel, 'Blue gradient face');
    const blueThickness = verticalBounds(iosModel, 'Blue thickness');

    assert.deepEqual(androidModel.buffer, iosModel.buffer);
    assert.equal(blueFace.minimum, borderTop.maximum);
    assert.equal(blueFace.maximum, borderTop.maximum);
    assert.deepEqual(blueThickness, borderThickness);
});
