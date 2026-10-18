import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// glTF is Y-up; -Z points north after Mapbox's coordinate conversion.
const SEGMENTS = 24;
const LENGTH = 60;
const WIDTH_RADIUS = LENGTH * Math.tan((20 * Math.PI) / 180);
const HEIGHT_RADIUS = LENGTH * Math.tan((10 * Math.PI) / 180);
// Sit 2 cm above ground after the ModelLayer's 2.5 m translation so the
// filled underside does not flicker against the map's ground surface.
const GROUND_Y = -2.48;

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const name = Buffer.from(type);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, checksum]);
}

function beamTexture() {
    const width = 64;
    const height = 64;
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const pixels = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const distance = y / (height - 1);
        const rim = Math.max(0, (distance - 0.96) / 0.04);
        const alpha = Math.round(155 - 85 * distance + 35 * rim);
        for (let x = 0; x < width; x++) {
            const around = (x / (width - 1)) * Math.PI * 2;
            const shade = 0.85 + 0.15 * Math.sin(around);
            pixels.set(
                [
                    Math.round(238 * shade),
                    Math.round(104 * shade),
                    Math.round(112 * shade),
                    alpha,
                ],
                y * (width * 4 + 1) + 1 + x * 4,
            );
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(pixels)),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

export function buildCameraViewCone() {
    const vertices = [{ position: [0, 0, 0], normal: [0, 0, 1], uv: [0.5, 0] }];
    for (let segment = 0; segment <= SEGMENTS; segment++) {
        const angle = (segment * Math.PI * 2) / SEGMENTS;
        const normal = [
            Math.cos(angle) / WIDTH_RADIUS,
            Math.sin(angle) / HEIGHT_RADIUS,
            1 / LENGTH,
        ];
        const magnitude = Math.hypot(...normal);
        vertices.push({
            position: [
                WIDTH_RADIUS * Math.cos(angle),
                HEIGHT_RADIUS * Math.sin(angle),
                -LENGTH,
            ],
            normal: normal.map((value) => value / magnitude),
            uv: [segment / SEGMENTS, 1],
        });
    }

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const intersections = new Map();
    const emittedVertices = new Map();
    function groundIntersection(firstIndex, secondIndex) {
        const key = [firstIndex, secondIndex].sort((a, b) => a - b).join(':');
        if (!intersections.has(key)) {
            const first = vertices[firstIndex];
            const second = vertices[secondIndex];
            const fraction =
                (GROUND_Y - first.position[1]) /
                (second.position[1] - first.position[1]);
            const interpolate = (attribute) =>
                first[attribute].map(
                    (value, axis) =>
                        value + fraction * (second[attribute][axis] - value),
                );
            const position = interpolate('position');
            position[1] = GROUND_Y;
            const normal = interpolate('normal');
            const magnitude = Math.hypot(...normal);
            intersections.set(key, {
                position,
                normal: normal.map((value) => value / magnitude),
                uv: interpolate('uv'),
            });
        }
        return intersections.get(key);
    }
    function emitVertex(vertex) {
        if (!emittedVertices.has(vertex)) {
            emittedVertices.set(vertex, positions.length / 3);
            positions.push(...vertex.position);
            normals.push(...vertex.normal);
            uvs.push(...vertex.uv);
        }
        return emittedVertices.get(vertex);
    }

    // Clip each shell triangle, retaining both intersection points when a
    // triangle becomes a quad. Interpolate UVs so the cut does not stretch
    // the texture or acquire the bright rim intended for the 60 m endpoint.
    for (let segment = 0; segment < SEGMENTS; segment++) {
        const triangle = [0, segment + 1, segment + 2];
        const polygon = [];
        for (let edge = 0; edge < triangle.length; edge++) {
            const previous = triangle[(edge + 2) % 3];
            const current = triangle[edge];
            const previousInside = vertices[previous].position[1] >= GROUND_Y;
            const currentInside = vertices[current].position[1] >= GROUND_Y;
            if (previousInside !== currentInside) {
                polygon.push(groundIntersection(previous, current));
            }
            if (currentInside) {
                polygon.push(vertices[current]);
            }
        }
        for (let corner = 1; corner < polygon.length - 1; corner++) {
            indices.push(
                ...[polygon[0], polygon[corner], polygon[corner + 1]].map(
                    emitVertex,
                ),
            );
        }
    }

    // Close the two openings with translucent faces. Separate vertices keep
    // the cap normals flat while the outer shell retains its smooth shading.
    const shellPositions = Array.from(
        { length: positions.length / 3 },
        (_, index) => positions.slice(index * 3, index * 3 + 3),
    );
    function addCap(boundary, normal, axes, reverse = false) {
        const unique = [
            ...new Map(
                boundary.map((position) => [
                    position
                        .map((value) => Math.round(value * 100000))
                        .join(','),
                    position,
                ]),
            ).values(),
        ];
        const center = axes.map(
            (axis) =>
                unique.reduce((sum, position) => sum + position[axis], 0) /
                unique.length,
        );
        unique.sort(
            (a, b) =>
                Math.atan2(a[axes[1]] - center[1], a[axes[0]] - center[0]) -
                Math.atan2(b[axes[1]] - center[1], b[axes[0]] - center[0]),
        );
        if (reverse) unique.reverse();
        const cap = unique.map((position) =>
            emitVertex({ position, normal, uv: [0, -position[2] / LENGTH] }),
        );
        const centerPosition = [0, 1, 2].map(
            (axis) =>
                unique.reduce((sum, position) => sum + position[axis], 0) /
                unique.length,
        );
        const centerIndex = emitVertex({
            position: centerPosition,
            normal,
            uv: [0, -centerPosition[2] / LENGTH],
        });
        for (let corner = 0; corner < cap.length; corner++) {
            indices.push(
                centerIndex,
                cap[corner],
                cap[(corner + 1) % cap.length],
            );
        }
    }
    addCap(
        shellPositions.filter(([, , z]) => z === -LENGTH),
        [0, 0, -1],
        [0, 1],
        true,
    );
    addCap(
        shellPositions.filter(([, y]) => y === GROUND_Y),
        [0, -1, 0],
        [0, 2],
    );

    const bufferViews = [];
    const buffers = [];
    let byteLength = 0;
    function addBuffer(bytes, target) {
        const index = bufferViews.length;
        bufferViews.push({
            buffer: 0,
            byteOffset: byteLength,
            byteLength: bytes.length,
            ...(target ? { target } : {}),
        });
        const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
        bytes.copy(padded);
        buffers.push(padded);
        byteLength += padded.length;
        return index;
    }
    function floats(values) {
        const bytes = Buffer.alloc(values.length * 4);
        values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
        return bytes;
    }
    const indexBytes = Buffer.alloc(indices.length * 2);
    indices.forEach((value, index) =>
        indexBytes.writeUInt16LE(value, index * 2),
    );
    const positionBuffer = addBuffer(floats(positions), 34962);
    const normalBuffer = addBuffer(floats(normals), 34962);
    const uvBuffer = addBuffer(floats(uvs), 34962);
    const indexBuffer = addBuffer(indexBytes, 34963);
    const textureBuffer = addBuffer(beamTexture());
    const floatPositions = new Float32Array(positions);
    const bounds = (fn) =>
        [0, 1, 2].map((axis) =>
            fn(
                ...Array.from(floatPositions).filter(
                    (_, index) => index % 3 === axis,
                ),
            ),
        );
    const document = {
        asset: { version: '2.0', generator: 'DAF camera view cone' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'CameraViewCone', mesh: 0 }],
        meshes: [
            {
                primitives: [
                    {
                        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
                        indices: 3,
                        material: 0,
                        mode: 4,
                    },
                ],
            },
        ],
        accessors: [
            {
                bufferView: positionBuffer,
                componentType: 5126,
                count: positions.length / 3,
                type: 'VEC3',
                min: bounds(Math.min),
                max: bounds(Math.max),
            },
            {
                bufferView: normalBuffer,
                componentType: 5126,
                count: normals.length / 3,
                type: 'VEC3',
            },
            {
                bufferView: uvBuffer,
                componentType: 5126,
                count: uvs.length / 2,
                type: 'VEC2',
            },
            {
                bufferView: indexBuffer,
                componentType: 5123,
                count: indices.length,
                type: 'SCALAR',
            },
        ],
        materials: [
            {
                name: 'Soft beam',
                doubleSided: true,
                alphaMode: 'BLEND',
                pbrMetallicRoughness: {
                    baseColorFactor: [1, 1, 1, 1],
                    baseColorTexture: { index: 0 },
                    metallicFactor: 0,
                    roughnessFactor: 1,
                },
                emissiveFactor: [1, 1, 1],
                emissiveTexture: { index: 0 },
            },
        ],
        textures: [{ sampler: 0, source: 0 }],
        samplers: [
            { magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 },
        ],
        images: [{ bufferView: textureBuffer, mimeType: 'image/png' }],
        bufferViews,
        buffers: [{ byteLength }],
    };
    const json = Buffer.from(JSON.stringify(document));
    const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
    json.copy(jsonPadded);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + jsonPadded.length + byteLength, 8);
    header.writeUInt32LE(jsonPadded.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(byteLength, 0);
    binaryHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jsonPadded, binaryHeader, ...buffers]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const model = buildCameraViewCone();
    writeFileSync(
        new URL('../assets/map/camera-view-cone.glb', import.meta.url),
        model,
    );
    console.log(`Ground-clipped camera view cone: ${model.length} bytes`);
}
