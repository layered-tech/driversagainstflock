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

test('navigation puck blue gradient is baked into an emissive texture', async () => {
    const model = await readGlb('ios/navigation_puck.glb');
    const { material, primitive } = materialPrimitive(
        model,
        'Blue gradient face',
    );
    const pbr = material.pbrMetallicRoughness;

    assert.equal(primitive.attributes.COLOR_0, undefined);
    assert.equal(typeof primitive.attributes.TEXCOORD_0, 'number');
    assert.equal(pbr.metallicFactor, 0);
    assert.equal(pbr.roughnessFactor, 1);
    assert.deepEqual(pbr.baseColorFactor, [0, 0, 0, 1]);
    assert.equal(pbr.baseColorTexture.texCoord, 0);
    assert.deepEqual(material.emissiveFactor, [1, 1, 1]);
    assert.deepEqual(material.emissiveTexture, pbr.baseColorTexture);
    assert.equal(
        model.document.extensionsUsed?.includes('KHR_materials_unlit') ?? false,
        false,
    );

    const texture = model.document.textures[pbr.baseColorTexture.index];
    const image = model.document.images[texture.source];
    const imageBufferView = model.document.bufferViews[image.bufferView];
    const imageOffset = model.binaryChunkOffset + imageBufferView.byteOffset;
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    assert.equal(image.mimeType, 'image/png');
    assert.deepEqual(
        model.buffer.subarray(imageOffset, imageOffset + pngSignature.length),
        pngSignature,
    );
    assert.equal(model.buffer.readUInt32BE(imageOffset + 16), 4);
    assert.equal(model.buffer.readUInt32BE(imageOffset + 20), 256);

    const textureCoordinates = floatAccessorVectors(
        model,
        primitive.attributes.TEXCOORD_0,
    );
    const longitudinalCoordinates = textureCoordinates.map(
        ([, vertical]) => vertical,
    );

    assert.equal(textureCoordinates.length, 36);
    assert.equal(
        textureCoordinates.every(([horizontal]) => horizontal === 0.5),
        true,
    );
    assert.equal(Math.min(...longitudinalCoordinates), 0);
    assert.equal(Math.max(...longitudinalCoordinates), 1);
});
