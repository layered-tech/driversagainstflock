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
const WHITE_BORDER_TOP_MATERIAL = 'White border top';
const WHITE_BORDER_THICKNESS_MATERIAL = 'White border thickness';
const WHITE_BORDER_CHAMFER_MATERIAL = 'White border chamfer';
const NAVIGATION_PUCK_FACE_MATERIAL = 'Blue gradient face';
const SOURCE_WHITE_BORDER_CONTOUR_ACCESSOR = 'Source white border contour';
const WHITE_BORDER_RING_POSITION_BUFFER_VIEW = 'White border ring positions';
const WHITE_BORDER_RING_NORMAL_BUFFER_VIEW = 'White border ring normals';
const WHITE_BORDER_RING_INDEX_BUFFER_VIEW = 'White border ring indices';
const WHITE_BORDER_RING_POSITION_ACCESSOR =
    'White border ring position accessor';
const WHITE_BORDER_RING_NORMAL_ACCESSOR = 'White border ring normal accessor';
const WHITE_BORDER_RING_INDEX_ACCESSOR = 'White border ring index accessor';
const WHITE_BORDER_CHAMFER_POSITION_BUFFER_VIEW =
    'White border chamfer positions';
const WHITE_BORDER_CHAMFER_NORMAL_BUFFER_VIEW = 'White border chamfer normals';
const WHITE_BORDER_CHAMFER_INDEX_BUFFER_VIEW = 'White border chamfer indices';
const WHITE_BORDER_CHAMFER_POSITION_ACCESSOR =
    'White border chamfer position accessor';
const WHITE_BORDER_CHAMFER_NORMAL_ACCESSOR =
    'White border chamfer normal accessor';
const WHITE_BORDER_CHAMFER_INDEX_ACCESSOR =
    'White border chamfer index accessor';
const BAKED_GRADIENT_IMAGE = 'Baked blue gradient';
const BAKED_GRADIENT_SAMPLER = 'Baked blue gradient sampler';
const BAKED_GRADIENT_TEXTURE = 'Baked blue gradient texture';
const LIGHT_BLUE = [0.42, 0.72, 1, 1];
const DARK_BLUE = [0.055, 0.31, 0.72, 1];
const PNG_WIDTH = 4;
const PNG_HEIGHT = 256;
const WHITE_BORDER_CHAMFER_SIZE = 0.0075;
const NAVIGATION_PUCK_VISUAL_CENTER_Z = 0.078056034471642;
const GENERATED_GEOMETRY_BUFFER_VIEW_NAMES = new Set([
    WHITE_BORDER_RING_POSITION_BUFFER_VIEW,
    WHITE_BORDER_RING_NORMAL_BUFFER_VIEW,
    WHITE_BORDER_RING_INDEX_BUFFER_VIEW,
    WHITE_BORDER_CHAMFER_POSITION_BUFFER_VIEW,
    WHITE_BORDER_CHAMFER_NORMAL_BUFFER_VIEW,
    WHITE_BORDER_CHAMFER_INDEX_BUFFER_VIEW,
]);

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

function writeAccessorVectors(document, binary, accessorIndex, vectors) {
    const accessor = document.accessors[accessorIndex];
    const bufferView = document.bufferViews[accessor.bufferView];
    const componentCounts = { VEC2: 2, VEC3: 3, VEC4: 4 };
    const componentCount = componentCounts[accessor.type];

    assert(accessor.componentType === 5126, 'Expected a float accessor.');
    assert(componentCount !== undefined, 'Unsupported accessor vector type.');
    assert(accessor.count === vectors.length, 'Accessor count changed.');

    const byteStride = bufferView.byteStride ?? componentCount * 4;
    const byteOffset = bufferView.byteOffset + (accessor.byteOffset ?? 0);

    vectors.forEach((vector, vectorIndex) => {
        assert(vector.length === componentCount, 'Accessor type changed.');

        vector.forEach((component, componentIndex) => {
            binary.writeFloatLE(
                component,
                byteOffset + vectorIndex * byteStride + componentIndex * 4,
            );
        });
    });

    const bounds = getVectorBounds(vectors);
    accessor.min = bounds.minimum;
    accessor.max = bounds.maximum;
}

function getVectorBounds(vectors) {
    const componentCount = vectors[0].length;

    return {
        maximum: Array.from({ length: componentCount }, (_, componentIndex) =>
            Math.max(...vectors.map((vector) => vector[componentIndex])),
        ),
        minimum: Array.from({ length: componentCount }, (_, componentIndex) =>
            Math.min(...vectors.map((vector) => vector[componentIndex])),
        ),
    };
}

function makeFloatVectorBuffer(vectors) {
    const componentCount = vectors[0].length;
    const buffer = Buffer.alloc(vectors.length * componentCount * 4);

    vectors.forEach((vector, vectorIndex) => {
        vector.forEach((component, componentIndex) => {
            buffer.writeFloatLE(
                component,
                (vectorIndex * componentCount + componentIndex) * 4,
            );
        });
    });

    return buffer;
}

function makeUnsignedShortBuffer(values) {
    const buffer = Buffer.alloc(values.length * 2);

    values.forEach((value, index) => {
        buffer.writeUInt16LE(value, index * 2);
    });

    return buffer;
}

function findMaterialPrimitive(document, materialName) {
    const materialIndex = document.materials.findIndex(
        (material) => material.name === materialName,
    );
    assert(materialIndex >= 0, `Missing ${materialName} material.`);

    const primitive = document.meshes
        .flatMap((mesh) => mesh.primitives)
        .find((candidate) => candidate.material === materialIndex);
    assert(primitive !== undefined, `Missing ${materialName} primitive.`);

    return { materialIndex, primitive };
}

function alignContours(outerContour, innerContour) {
    assert(
        outerContour.length === innerContour.length,
        'Puck contours must have matching vertex counts.',
    );

    const vertexCount = outerContour.length;
    let bestShift = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let shift = 0; shift < vertexCount; shift += 1) {
        let distance = 0;

        for (let index = 0; index < vertexCount; index += 1) {
            const outer = outerContour[index];
            const inner = innerContour[(index + shift) % vertexCount];
            distance += (outer[0] - inner[0]) ** 2 + (outer[2] - inner[2]) ** 2;
        }

        if (distance < bestDistance) {
            bestDistance = distance;
            bestShift = shift;
        }
    }

    return outerContour.map(
        (_, index) => innerContour[(index + bestShift) % vertexCount],
    );
}

function insetContourToward(outerContour, innerContour, distance) {
    return outerContour.map((outer, index) => {
        const inner = innerContour[index];
        const longitudeDelta = inner[0] - outer[0];
        const latitudeDelta = inner[2] - outer[2];
        const contourDistance = Math.hypot(longitudeDelta, latitudeDelta);
        assert(
            contourDistance > distance,
            'White border is too narrow for its chamfer.',
        );

        return [
            outer[0] + (longitudeDelta / contourDistance) * distance,
            outer[1],
            outer[2] + (latitudeDelta / contourDistance) * distance,
        ];
    });
}

function makeRingIndices(vertexCount) {
    const indices = [];

    for (let index = 0; index < vertexCount; index += 1) {
        const nextIndex = (index + 1) % vertexCount;
        indices.push(
            index,
            nextIndex,
            vertexCount + nextIndex,
            index,
            vertexCount + nextIndex,
            vertexCount + index,
        );
    }

    return indices;
}

function subtractVectors(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function crossProduct(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalizeVector(vector) {
    const length = Math.hypot(...vector);
    assert(length > 0, 'Cannot normalize an empty vector.');

    return vector.map((component) => component / length);
}

function makeChamferNormals(lowerContour, upperContour) {
    const faceNormals = lowerContour.map((lower, index) => {
        const nextIndex = (index + 1) % lowerContour.length;

        return normalizeVector(
            crossProduct(
                subtractVectors(lowerContour[nextIndex], lower),
                subtractVectors(upperContour[nextIndex], lower),
            ),
        );
    });
    const vertexNormals = faceNormals.map((faceNormal, index) => {
        const previousNormal =
            faceNormals[(index - 1 + faceNormals.length) % faceNormals.length];

        return normalizeVector(
            faceNormal.map(
                (component, componentIndex) =>
                    component + previousNormal[componentIndex],
            ),
        );
    });

    return [...vertexNormals, ...vertexNormals];
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
    const { materialIndex, primitive } = findMaterialPrimitive(
        document,
        NAVIGATION_PUCK_FACE_MATERIAL,
    );
    const whiteBorder = findMaterialPrimitive(
        document,
        WHITE_BORDER_TOP_MATERIAL,
    );
    const whiteBorderThickness = findMaterialPrimitive(
        document,
        WHITE_BORDER_THICKNESS_MATERIAL,
    );
    let sourceWhiteBorderContourAccessorIndex = findNamedIndex(
        document.accessors,
        SOURCE_WHITE_BORDER_CONTOUR_ACCESSOR,
    );

    if (sourceWhiteBorderContourAccessorIndex < 0) {
        sourceWhiteBorderContourAccessorIndex =
            whiteBorder.primitive.attributes.POSITION;
        document.accessors[sourceWhiteBorderContourAccessorIndex].name =
            SOURCE_WHITE_BORDER_CONTOUR_ACCESSOR;
    }

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
    const generatedGeometryBufferViewIndexes = new Set(
        document.bufferViews
            .map((bufferView, index) => ({ bufferView, index }))
            .filter(({ bufferView }) =>
                GENERATED_GEOMETRY_BUFFER_VIEW_NAMES.has(bufferView.name),
            )
            .map(({ index }) => index),
    );
    const geometryLength = Math.max(
        ...document.bufferViews
            .filter(
                (_, index) =>
                    index !== existingImageBufferViewIndex &&
                    !generatedGeometryBufferViewIndexes.has(index),
            )
            .map((bufferView) => bufferView.byteOffset + bufferView.byteLength),
    );
    let geometryBinary = Buffer.alloc(alignToFour(geometryLength));
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

    const sourceWhiteBorderContour = readAccessorVectors(
        document,
        geometryBinary,
        sourceWhiteBorderContourAccessorIndex,
    );
    const alignedBlueContour = alignContours(
        sourceWhiteBorderContour,
        positions,
    );
    const insetWhiteBorderContour = insetContourToward(
        sourceWhiteBorderContour,
        alignedBlueContour,
        WHITE_BORDER_CHAMFER_SIZE,
    );
    const topHeight = Math.max(
        ...sourceWhiteBorderContour.map((position) => position[1]),
    );
    const chamferLowerHeight = topHeight - WHITE_BORDER_CHAMFER_SIZE;
    const lowerWhiteBorderContour = sourceWhiteBorderContour.map(
        ([longitude, , latitude]) => [longitude, chamferLowerHeight, latitude],
    );
    const upperWhiteBorderContour = insetWhiteBorderContour.map(
        ([longitude, , latitude]) => [longitude, topHeight, latitude],
    );
    const whiteBorderRingPositions = [
        ...upperWhiteBorderContour,
        ...alignedBlueContour,
    ];
    const whiteBorderRingNormals = whiteBorderRingPositions.map(() => [
        0, 1, 0,
    ]);
    const whiteBorderRingIndices = makeRingIndices(
        sourceWhiteBorderContour.length,
    );
    const whiteBorderChamferPositions = [
        ...lowerWhiteBorderContour,
        ...upperWhiteBorderContour,
    ];
    const whiteBorderChamferNormals = makeChamferNormals(
        lowerWhiteBorderContour,
        upperWhiteBorderContour,
    );
    const whiteBorderChamferIndices = makeRingIndices(
        sourceWhiteBorderContour.length,
    );

    const whiteBorderThicknessPositions = readAccessorVectors(
        document,
        geometryBinary,
        whiteBorderThickness.primitive.attributes.POSITION,
    );
    const whiteBorderThicknessMinimumHeight = Math.min(
        ...whiteBorderThicknessPositions.map((position) => position[1]),
    );
    const whiteBorderThicknessMaximumHeight = Math.max(
        ...whiteBorderThicknessPositions.map((position) => position[1]),
    );
    const whiteBorderThicknessMiddleHeight =
        whiteBorderThicknessMinimumHeight +
        (whiteBorderThicknessMaximumHeight -
            whiteBorderThicknessMinimumHeight) /
            2;
    const shortenedWhiteBorderThicknessPositions =
        whiteBorderThicknessPositions.map(([longitude, height, latitude]) => [
            longitude,
            height > whiteBorderThicknessMiddleHeight
                ? chamferLowerHeight
                : height,
            latitude,
        ]);
    writeAccessorVectors(
        document,
        geometryBinary,
        whiteBorderThickness.primitive.attributes.POSITION,
        shortenedWhiteBorderThicknessPositions,
    );

    const appendGeneratedBufferView = (name, buffer, target) => {
        const byteOffset = alignToFour(geometryBinary.length);

        if (byteOffset > geometryBinary.length) {
            geometryBinary = Buffer.concat([
                geometryBinary,
                Buffer.alloc(byteOffset - geometryBinary.length),
            ]);
        }

        const bufferViewIndex = findOrAppendNamedEntry(
            document,
            'bufferViews',
            name,
            {
                buffer: 0,
                byteLength: buffer.length,
                byteOffset,
                target,
            },
        );
        geometryBinary = Buffer.concat([geometryBinary, buffer]);

        return bufferViewIndex;
    };
    const appendGeneratedPrimitive = ({
        indexAccessorName,
        indexBufferViewName,
        indices,
        normalAccessorName,
        normalBufferViewName,
        normals,
        positionAccessorName,
        positionBufferViewName,
        positions: generatedPositions,
    }) => {
        const positionBufferViewIndex = appendGeneratedBufferView(
            positionBufferViewName,
            makeFloatVectorBuffer(generatedPositions),
            34962,
        );
        const positionBounds = getVectorBounds(generatedPositions);
        const positionAccessorIndex = findOrAppendNamedEntry(
            document,
            'accessors',
            positionAccessorName,
            {
                bufferView: positionBufferViewIndex,
                byteOffset: 0,
                componentType: 5126,
                count: generatedPositions.length,
                max: positionBounds.maximum,
                min: positionBounds.minimum,
                type: 'VEC3',
            },
        );
        const normalBufferViewIndex = appendGeneratedBufferView(
            normalBufferViewName,
            makeFloatVectorBuffer(normals),
            34962,
        );
        const normalAccessorIndex = findOrAppendNamedEntry(
            document,
            'accessors',
            normalAccessorName,
            {
                bufferView: normalBufferViewIndex,
                byteOffset: 0,
                componentType: 5126,
                count: normals.length,
                type: 'VEC3',
            },
        );
        const indexBufferViewIndex = appendGeneratedBufferView(
            indexBufferViewName,
            makeUnsignedShortBuffer(indices),
            34963,
        );
        const indexAccessorIndex = findOrAppendNamedEntry(
            document,
            'accessors',
            indexAccessorName,
            {
                bufferView: indexBufferViewIndex,
                byteOffset: 0,
                componentType: 5123,
                count: indices.length,
                max: [Math.max(...indices)],
                min: [Math.min(...indices)],
                type: 'SCALAR',
            },
        );

        return {
            attributes: {
                NORMAL: normalAccessorIndex,
                POSITION: positionAccessorIndex,
            },
            indices: indexAccessorIndex,
            mode: 4,
        };
    };
    const whiteBorderRingPrimitive = appendGeneratedPrimitive({
        indexAccessorName: WHITE_BORDER_RING_INDEX_ACCESSOR,
        indexBufferViewName: WHITE_BORDER_RING_INDEX_BUFFER_VIEW,
        indices: whiteBorderRingIndices,
        normalAccessorName: WHITE_BORDER_RING_NORMAL_ACCESSOR,
        normalBufferViewName: WHITE_BORDER_RING_NORMAL_BUFFER_VIEW,
        normals: whiteBorderRingNormals,
        positionAccessorName: WHITE_BORDER_RING_POSITION_ACCESSOR,
        positionBufferViewName: WHITE_BORDER_RING_POSITION_BUFFER_VIEW,
        positions: whiteBorderRingPositions,
    });
    const whiteBorderChamferPrimitive = appendGeneratedPrimitive({
        indexAccessorName: WHITE_BORDER_CHAMFER_INDEX_ACCESSOR,
        indexBufferViewName: WHITE_BORDER_CHAMFER_INDEX_BUFFER_VIEW,
        indices: whiteBorderChamferIndices,
        normalAccessorName: WHITE_BORDER_CHAMFER_NORMAL_ACCESSOR,
        normalBufferViewName: WHITE_BORDER_CHAMFER_NORMAL_BUFFER_VIEW,
        normals: whiteBorderChamferNormals,
        positionAccessorName: WHITE_BORDER_CHAMFER_POSITION_ACCESSOR,
        positionBufferViewName: WHITE_BORDER_CHAMFER_POSITION_BUFFER_VIEW,
        positions: whiteBorderChamferPositions,
    });

    Object.assign(whiteBorder.primitive, {
        ...whiteBorderRingPrimitive,
        material: whiteBorder.materialIndex,
    });
    document.materials[whiteBorder.materialIndex].pbrMetallicRoughness = {
        ...document.materials[whiteBorder.materialIndex].pbrMetallicRoughness,
        metallicFactor: 0,
        roughnessFactor: 1,
    };
    const whiteBorderChamferMaterialIndex = findOrAppendNamedEntry(
        document,
        'materials',
        WHITE_BORDER_CHAMFER_MATERIAL,
        {
            pbrMetallicRoughness: {
                baseColorFactor: [0.9, 0.93, 0.97, 1],
                metallicFactor: 0,
                roughnessFactor: 1,
            },
        },
    );
    const existingWhiteBorderChamferPrimitive = document.meshes
        .flatMap((mesh) => mesh.primitives)
        .find(
            (candidate) =>
                candidate.material === whiteBorderChamferMaterialIndex,
        );
    const resolvedWhiteBorderChamferPrimitive = {
        ...whiteBorderChamferPrimitive,
        material: whiteBorderChamferMaterialIndex,
    };

    if (existingWhiteBorderChamferPrimitive) {
        Object.assign(
            existingWhiteBorderChamferPrimitive,
            resolvedWhiteBorderChamferPrimitive,
        );
    } else {
        document.meshes[0].primitives.push(resolvedWhiteBorderChamferPrimitive);
    }

    const gradientPng = makeGradientPng();
    const imageByteOffset = alignToFour(geometryBinary.length);

    if (imageByteOffset > geometryBinary.length) {
        geometryBinary = Buffer.concat([
            geometryBinary,
            Buffer.alloc(imageByteOffset - geometryBinary.length),
        ]);
    }
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
    const navigationPuckNode = document.nodes.find(
        (node) => node.name === 'NavigationPuck',
    );
    assert(navigationPuckNode !== undefined, 'Missing navigation puck node.');
    navigationPuckNode.translation = [0, 0, -NAVIGATION_PUCK_VISUAL_CENTER_Z];
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
