import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const locationPuckModuleDirectory = path.resolve(
    testDirectory,
    '../../../modules/map-location-puck',
);
const expectedModelHash =
    'ab6a662ad8d0696f4a763ce364a1f73c0d4c5a56361baa4ab57644e85381fccc';

async function readGlb(relativePath) {
    const buffer = await readFile(
        path.join(locationPuckModuleDirectory, relativePath),
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

function materialPrimitive(model, materialName) {
    const materialIndex = model.document.materials.findIndex(
        (material) => material.name === materialName,
    );
    const primitive = model.document.meshes
        .flatMap((mesh) => mesh.primitives)
        .find((candidate) => candidate.material === materialIndex);

    return {
        material: model.document.materials[materialIndex],
        primitive,
    };
}

function floatAccessorVectors(model, accessorIndex) {
    const accessor = model.document.accessors[accessorIndex];
    const bufferView = model.document.bufferViews[accessor.bufferView];
    const componentCounts = { VEC2: 2, VEC3: 3, VEC4: 4 };
    const componentCount = componentCounts[accessor.type];
    const byteStride = bufferView.byteStride ?? componentCount * 4;
    const accessorOffset =
        model.binaryChunkOffset +
        bufferView.byteOffset +
        (accessor.byteOffset ?? 0);

    assert.equal(accessor.componentType, 5126);

    return Array.from({ length: accessor.count }, (_, vectorIndex) =>
        Array.from({ length: componentCount }, (_, componentIndex) =>
            model.buffer.readFloatLE(
                accessorOffset + vectorIndex * byteStride + componentIndex * 4,
            ),
        ),
    );
}

function verticalBounds(model, materialName) {
    const primitive = materialPrimitive(model, materialName).primitive;
    const positions = floatAccessorVectors(
        model,
        primitive.attributes.POSITION,
    );
    const verticalPositions = positions.map(([, vertical]) => vertical);

    return {
        maximum: Math.max(...verticalPositions),
        minimum: Math.min(...verticalPositions),
    };
}

test('the exact Maps-only 3D puck is packaged for Android and iOS', async () => {
    const androidModel = await readGlb(
        'android/src/main/assets/navigation_puck.glb',
    );
    const iosModel = await readGlb('ios/navigation_puck.glb');

    assert.deepEqual(androidModel.buffer, iosModel.buffer);
    assert.equal(androidModel.buffer.byteLength, 21_636);
    assert.equal(
        createHash('sha256').update(androidModel.buffer).digest('hex'),
        expectedModelHash,
    );
});

test('the 3D puck keeps its flush face, white rim, and centered origin', async () => {
    const model = await readGlb('ios/navigation_puck.glb');
    const borderTop = verticalBounds(model, 'White border top');
    const borderChamfer = verticalBounds(model, 'White border chamfer');
    const borderThickness = verticalBounds(model, 'White border thickness');
    const blueFace = verticalBounds(model, 'Blue gradient face');
    const blueThickness = verticalBounds(model, 'Blue thickness');
    const puckNode = model.document.nodes.find(
        (node) => node.name === 'NavigationPuck',
    );

    assert.equal(blueFace.minimum, borderTop.maximum);
    assert.equal(blueFace.maximum, borderTop.maximum);
    assert.equal(blueThickness.maximum, blueFace.maximum);
    assert.equal(borderThickness.maximum, borderChamfer.minimum);
    assert.equal(borderChamfer.maximum, borderTop.minimum);
    assert.deepEqual(puckNode.translation, [0, 0, -0.078056034471642]);
});

test('the blue face uses the baked 4x256 emissive gradient', async () => {
    const model = await readGlb('ios/navigation_puck.glb');
    const { material, primitive } = materialPrimitive(
        model,
        'Blue gradient face',
    );
    const pbr = material.pbrMetallicRoughness;
    const texture = model.document.textures[pbr.baseColorTexture.index];
    const image = model.document.images[texture.source];
    const imageBufferView = model.document.bufferViews[image.bufferView];
    const imageOffset = model.binaryChunkOffset + imageBufferView.byteOffset;

    assert.equal(primitive.attributes.COLOR_0, undefined);
    assert.equal(typeof primitive.attributes.TEXCOORD_0, 'number');
    assert.deepEqual(pbr.baseColorFactor, [0, 0, 0, 1]);
    assert.deepEqual(material.emissiveFactor, [1, 1, 1]);
    assert.deepEqual(material.emissiveTexture, pbr.baseColorTexture);
    assert.equal(image.mimeType, 'image/png');
    assert.equal(model.buffer.readUInt32BE(imageOffset + 16), 4);
    assert.equal(model.buffer.readUInt32BE(imageOffset + 20), 256);
});
