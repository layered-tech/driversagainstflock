import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const expoDirectory = path.resolve(scriptDirectory, '..');
const iosModelPath = path.join(
    expoDirectory,
    'mapbox-navigation/ios/navigation_puck.glb',
);
const androidModelPath = path.join(
    expoDirectory,
    'mapbox-navigation/android/src/main/assets/navigation_puck.glb',
);

const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BINARY_CHUNK_TYPE = 0x004e4942;
const NAVIGATION_PUCK_FACE_MATERIAL = 'Blue gradient face';
const BAKED_GRADIENT_IMAGE = 'Baked blue gradient';
const BAKED_GRADIENT_SAMPLER = 'Baked blue gradient sampler';
const BAKED_GRADIENT_TEXTURE = 'Baked blue gradient texture';
const LIGHT_BLUE = [0.42, 0.72, 1, 1];
const DARK_BLUE = [0.055, 0.31, 0.72, 1];
const PNG_WIDTH = 4;
const PNG_HEIGHT = 256;

function alignToFour(value) {
    return Math.ceil(value / 4) * 4;
}

function parseGlb(buffer) {
    assert(buffer.toString('ascii', 0, 4) === 'glTF', 'Invalid GLB header.');
    assert(buffer.readUInt32LE(4) === 2, 'Only GLB version 2 is supported.');

    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonChunkType = buffer.readUInt32LE(16);
    assert(jsonChunkType === GLB_JSON_CHUNK_TYPE, 'Missing GLB JSON chunk.');

    const jsonChunkEnd = 20 + jsonChunkLength;
    const binaryChunkLength = buffer.readUInt32LE(jsonChunkEnd);
    const binaryChunkType = buffer.readUInt32LE(jsonChunkEnd + 4);
    assert(
        binaryChunkType === GLB_BINARY_CHUNK_TYPE,
        'Missing GLB binary chunk.',
    );

    return {
        binary: buffer.subarray(
            jsonChunkEnd + 8,
            jsonChunkEnd + 8 + binaryChunkLength,
        ),
        document: JSON.parse(
            buffer.subarray(20, jsonChunkEnd).toString().trim(),
        ),
    };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function findNamedIndex(collection, name) {
    return collection?.findIndex((entry) => entry.name === name) ?? -1;
}

function findOrAppendNamedEntry(document, collectionName, name, entry) {
    document[collectionName] ??= [];
    const existingIndex = findNamedIndex(document[collectionName], name);

    if (existingIndex >= 0) {
        document[collectionName][existingIndex] = {
            ...document[collectionName][existingIndex],
            ...entry,
            name,
        };

        return existingIndex;
    }

    document[collectionName].push({ ...entry, name });

    return document[collectionName].length - 1;
}

function readAccessorVectors(document, binary, accessorIndex) {
    const accessor = document.accessors[accessorIndex];
    const bufferView = document.bufferViews[accessor.bufferView];
    const componentCounts = { VEC2: 2, VEC3: 3, VEC4: 4 };
    const componentCount = componentCounts[accessor.type];

    assert(accessor.componentType === 5126, 'Expected a float accessor.');
    assert(componentCount !== undefined, 'Unsupported accessor vector type.');

    const byteStride = bufferView.byteStride ?? componentCount * 4;
    const byteOffset = bufferView.byteOffset + (accessor.byteOffset ?? 0);

    return Array.from({ length: accessor.count }, (_, vectorIndex) =>
        Array.from({ length: componentCount }, (_, componentIndex) =>
            binary.readFloatLE(
                byteOffset + vectorIndex * byteStride + componentIndex * 4,
            ),
        ),
    );
}

function linearToSrgb(value) {
    if (value <= 0.0031308) {
        return value * 12.92;
    }

    return 1.055 * value ** (1 / 2.4) - 0.055;
}

function crc32(buffer) {
    let checksum = 0xffffffff;

    for (const byte of buffer) {
        checksum ^= byte;

        for (let bit = 0; bit < 8; bit += 1) {
            checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
        }
    }

    return (checksum ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBuffer.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(
        crc32(Buffer.concat([typeBuffer, data])),
        8 + data.length,
    );

    return chunk;
}

function makeGradientPng() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(PNG_WIDTH, 0);
    header.writeUInt32BE(PNG_HEIGHT, 4);
    header[8] = 8;
    header[9] = 6;

    const scanlineLength = PNG_WIDTH * 4 + 1;
    const scanlines = Buffer.alloc(scanlineLength * PNG_HEIGHT);

    for (let row = 0; row < PNG_HEIGHT; row += 1) {
        const progress = row / (PNG_HEIGHT - 1);
        const scanlineOffset = row * scanlineLength;
        scanlines[scanlineOffset] = 0;

        for (let column = 0; column < PNG_WIDTH; column += 1) {
            const pixelOffset = scanlineOffset + 1 + column * 4;

            for (let channel = 0; channel < 4; channel += 1) {
                const linearValue =
                    LIGHT_BLUE[channel] +
                    (DARK_BLUE[channel] - LIGHT_BLUE[channel]) * progress;
                const encodedValue =
                    channel === 3 ? linearValue : linearToSrgb(linearValue);
                scanlines[pixelOffset + channel] = Math.round(
                    Math.max(0, Math.min(1, encodedValue)) * 255,
                );
            }
        }
    }

    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        makePngChunk('IHDR', header),
        makePngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
        makePngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function writeUvCoordinates({
    binary,
    bufferView,
    positions,
    accessor,
    document,
}) {
    const longitudinalPositions = positions.map((position) => position[2]);
    const minimum = Math.min(...longitudinalPositions);
    const maximum = Math.max(...longitudinalPositions);
    const range = maximum - minimum;
    assert(range > 0, 'The puck face must have a longitudinal range.');

    const nextBufferViewOffset = Math.min(
        ...document.bufferViews
            .filter(
                (candidate) =>
                    candidate !== bufferView &&
                    candidate.byteOffset > bufferView.byteOffset,
            )
            .map((candidate) => candidate.byteOffset),
    );
    const writableEnd = Number.isFinite(nextBufferViewOffset)
        ? nextBufferViewOffset
        : bufferView.byteOffset + bufferView.byteLength;
    binary.fill(0, bufferView.byteOffset, writableEnd);

    positions.forEach((position, index) => {
        const offset = bufferView.byteOffset + index * 8;
        binary.writeFloatLE(0.5, offset);
        binary.writeFloatLE((position[2] - minimum) / range, offset + 4);
    });

    bufferView.byteLength = positions.length * 8;
    bufferView.target = 34962;
    delete bufferView.byteStride;
    accessor.byteOffset = 0;
    accessor.componentType = 5126;
    accessor.count = positions.length;
    accessor.type = 'VEC2';
    accessor.min = [0.5, 0];
    accessor.max = [0.5, 1];
    delete accessor.normalized;
}

function serializeGlb(document, binary) {
    const json = Buffer.from(JSON.stringify(document));
    const jsonChunkLength = alignToFour(json.length);
    const binaryChunkLength = alignToFour(binary.length);
    const output = Buffer.alloc(
        12 + 8 + jsonChunkLength + 8 + binaryChunkLength,
    );
    output.write('glTF', 0, 'ascii');
    output.writeUInt32LE(2, 4);
    output.writeUInt32LE(output.length, 8);
    output.writeUInt32LE(jsonChunkLength, 12);
    output.writeUInt32LE(GLB_JSON_CHUNK_TYPE, 16);
    json.copy(output, 20);
    output.fill(0x20, 20 + json.length, 20 + jsonChunkLength);

    const binaryHeaderOffset = 20 + jsonChunkLength;
    output.writeUInt32LE(binaryChunkLength, binaryHeaderOffset);
    output.writeUInt32LE(GLB_BINARY_CHUNK_TYPE, binaryHeaderOffset + 4);
    binary.copy(output, binaryHeaderOffset + 8);

    return output;
}

function bakeGradient(modelBuffer) {
    const { binary: sourceBinary, document } = parseGlb(modelBuffer);
    const materialIndex = document.materials.findIndex(
        (material) => material.name === NAVIGATION_PUCK_FACE_MATERIAL,
    );
    assert(materialIndex >= 0, 'Missing blue puck face material.');

    const primitive = document.meshes
        .flatMap((mesh) => mesh.primitives)
        .find((candidate) => candidate.material === materialIndex);
    assert(primitive !== undefined, 'Missing blue puck face primitive.');

    const uvAccessorIndex =
        primitive.attributes.TEXCOORD_0 ?? primitive.attributes.COLOR_0;
    assert(
        uvAccessorIndex !== undefined,
        'Missing puck face color or UV data.',
    );

    const existingImageIndex = findNamedIndex(
        document.images,
        BAKED_GRADIENT_IMAGE,
    );
    const existingImageBufferViewIndex =
        existingImageIndex >= 0
            ? document.images[existingImageIndex].bufferView
            : undefined;
    const geometryLength = Math.max(
        ...document.bufferViews
            .filter((_, index) => index !== existingImageBufferViewIndex)
            .map((bufferView) => bufferView.byteOffset + bufferView.byteLength),
    );
    const geometryBinary = Buffer.alloc(alignToFour(geometryLength));
    sourceBinary.copy(geometryBinary, 0, 0, geometryLength);

    const positions = readAccessorVectors(
        document,
        geometryBinary,
        primitive.attributes.POSITION,
    );
    const uvAccessor = document.accessors[uvAccessorIndex];
    const uvBufferView = document.bufferViews[uvAccessor.bufferView];
    writeUvCoordinates({
        accessor: uvAccessor,
        binary: geometryBinary,
        bufferView: uvBufferView,
        document,
        positions,
    });
    primitive.attributes.TEXCOORD_0 = uvAccessorIndex;
    delete primitive.attributes.COLOR_0;

    const gradientPng = makeGradientPng();
    const imageByteOffset = geometryBinary.length;
    const imageBufferViewIndex =
        existingImageBufferViewIndex ?? document.bufferViews.length;
    document.bufferViews[imageBufferViewIndex] = {
        buffer: 0,
        byteOffset: imageByteOffset,
        byteLength: gradientPng.length,
    };

    const imageIndex = findOrAppendNamedEntry(
        document,
        'images',
        BAKED_GRADIENT_IMAGE,
        {
            bufferView: imageBufferViewIndex,
            mimeType: 'image/png',
        },
    );
    const samplerIndex = findOrAppendNamedEntry(
        document,
        'samplers',
        BAKED_GRADIENT_SAMPLER,
        {
            magFilter: 9729,
            minFilter: 9729,
            wrapS: 33071,
            wrapT: 33071,
        },
    );
    const textureIndex = findOrAppendNamedEntry(
        document,
        'textures',
        BAKED_GRADIENT_TEXTURE,
        {
            sampler: samplerIndex,
            source: imageIndex,
        },
    );

    document.materials[materialIndex].emissiveFactor = [1, 1, 1];
    document.materials[materialIndex].emissiveTexture = {
        index: textureIndex,
        texCoord: 0,
    };
    document.materials[materialIndex].pbrMetallicRoughness = {
        baseColorFactor: [0, 0, 0, 1],
        baseColorTexture: { index: textureIndex, texCoord: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
    };
    document.asset.generator =
        'Drivers Against Flock navigation puck gradient baker';

    const binary = Buffer.concat([geometryBinary, gradientPng]);
    document.buffers[0].byteLength = binary.length;

    return serializeGlb(document, binary);
}

const sourceModel = await readFile(iosModelPath);
const bakedModel = bakeGradient(sourceModel);
await Promise.all([
    writeFile(iosModelPath, bakedModel),
    writeFile(androidModelPath, bakedModel),
]);
