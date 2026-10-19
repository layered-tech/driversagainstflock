import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { buildCameraViewCone } from '../../../scripts/generate-camera-view-cone.mjs';
import { loadTourModule } from './tour-test-helpers.mjs';

const require = createRequire(import.meta.url);
const styleSpec = require('../../../../node_modules/mapbox-gl/dist/style-spec/index.cjs');
const directionProperties = Array.from(
    { length: 8 },
    (_, index) => `coneDirection${index}`,
);

const model = readFileSync(
    new URL('../../../assets/map/camera-view-cone.glb', import.meta.url),
);
const jsonLength = model.readUInt32LE(12);
const document = JSON.parse(model.subarray(20, 20 + jsonLength).toString());
const binaryOffset = 28 + jsonLength;

test('Android models use a packaged asset URI instead of an unresolvable drawable name', () => {
    const { CameraViewConeModels } = loadTourModule(
        new URL('../camera-view-cone-model.js', import.meta.url),
        {
            '@rnmapbox/maps': { Models: 'Models', ModelLayer: 'ModelLayer' },
            './constants': {
                MARKER_CONE_DIRECTION_PROPERTY_NAMES: directionProperties,
            },
            'react-native': {
                Platform: { OS: 'android' },
                Image: {
                    resolveAssetSource: () => ({
                        uri: 'assets_map_cameraviewcone',
                    }),
                },
            },
            '../../assets/map/camera-view-cone.glb': 123,
        },
    );
    assert.equal(
        CameraViewConeModels().props.models['camera-view-cone'],
        'asset://camera-view-cone.glb',
    );
});

test('shared model layers preserve every direction and exclude clusters and unknown directions', () => {
    const components = loadTourModule(
        new URL('../camera-view-cone-model.js', import.meta.url),
        {
            '@rnmapbox/maps': { Models: 'Models', ModelLayer: 'ModelLayer' },
            './constants': {
                MARKER_CONE_DIRECTION_PROPERTY_NAMES: directionProperties,
            },
            'react-native': {
                Platform: { OS: 'ios' },
                Image: {
                    resolveAssetSource: () => ({ uri: 'file:///cone.glb' }),
                },
            },
            '../../assets/map/camera-view-cone.glb': 'bundled-cone',
        },
    );
    assert.deepEqual(
        components.renderMarkerConeModelLayers({
            idPrefix: 'hidden',
            sourceID: 'nodes',
            visible: false,
        }),
        [],
    );
    for (const sourceID of [
        'map-markers-clustered',
        'map-markers-unclustered',
    ]) {
        const layers = components.renderMarkerConeModelLayers({
            idPrefix: sourceID,
            sourceID,
            aboveLayerID: 'puck-model-layer',
            slot: 'top',
            isDarkMode: true,
        });
        assert.equal(layers.length, 8);
        const properties = {
            coneDirection0Rotation: [0, 0, 90],
            coneDirection1Rotation: [0, 0, 270],
        };
        for (const [index, element] of layers.entries()) {
            const layer = components.CameraViewConeModelLayer(element.props);
            assert.equal(layer.props.sourceID, sourceID);
            assert.equal(layer.props.slot, 'top');
            assert.equal(layer.props.aboveLayerID, 'puck-model-layer');
            assert.equal(layer.props.style.modelEmissiveStrength, 1);
            assert.equal(layer.props.style.modelAllowDensityReduction, false);
            const modelId = styleSpec.expression.createPropertyExpression(
                layer.props.style.modelId,
                styleSpec.latest.layout_model['model-id'],
            );
            const rotation = styleSpec.expression.createPropertyExpression(
                layer.props.style.modelRotation,
                styleSpec.latest.paint_model['model-rotation'],
            );
            assert.equal(modelId.result, 'success');
            assert.equal(rotation.result, 'success');
            const evaluate = (compiled, props) =>
                compiled.value.evaluate(
                    { zoom: 18 },
                    { type: 1, properties: props },
                );
            assert.equal(
                evaluate(modelId, properties),
                index < 2 ? 'camera-view-cone' : '',
            );
            assert.deepEqual(
                evaluate(rotation, properties),
                index === 0
                    ? [0, 0, 90]
                    : index === 1
                      ? [0, 0, 270]
                      : [0, 0, 0],
            );
            assert.equal(evaluate(modelId, {}), '');
            assert.equal(
                evaluate(modelId, { ...properties, point_count: 12 }),
                '',
            );
        }
    }
});

function readAccessor(index) {
    const accessor = document.accessors[index];
    const view = document.bufferViews[accessor.bufferView];
    const components = { VEC3: 3, VEC2: 2, SCALAR: 1 }[accessor.type];
    const componentSize = accessor.componentType === 5126 ? 4 : 2;
    return Array.from({ length: accessor.count }, (_, vertex) =>
        Array.from({ length: components }, (_, axis) => {
            const offset =
                binaryOffset +
                view.byteOffset +
                (vertex * components + axis) * componentSize;
            return componentSize === 4
                ? model.readFloatLE(offset)
                : model.readUInt16LE(offset);
        }),
    );
}

test('bundled cone is a self-contained reproducible GLB with a lightweight clipped mesh', () => {
    assert.deepEqual(model, buildCameraViewCone());
    assert.equal(model.readUInt32LE(0), 0x46546c67);
    assert.equal(model.readUInt32LE(4), 2);
    assert.equal(model.readUInt32LE(8), model.length);
    assert.equal(model.readUInt32LE(16), 0x4e4f534a);
    assert.equal(model.readUInt32LE(24 + jsonLength), 0x004e4942);
    assert.equal(document.buffers[0].byteLength, model.length - binaryOffset);
    assert.ok(model.length < 16384);
    assert.equal(document.meshes.length, 1);
    assert.equal(document.materials.length, 1);
    assert.equal(document.nodes.length, 1);
    assert.equal(document.meshes[0].primitives[0].mode, 4);
    assert.ok(document.accessors[3].count / 3 < 64);
    assert.ok(
        readAccessor(3)
            .flat()
            .every((index) => index < document.accessors[0].count),
    );
    for (const view of document.bufferViews) {
        assert.equal(view.byteOffset % 4, 0);
        assert.ok(
            view.byteOffset + view.byteLength <= document.buffers[0].byteLength,
        );
    }
    assert.equal(document.buffers[0].uri, undefined);
    assert.equal(document.images[0].uri, undefined);
});

test('cone keeps its node-centered tip with 40-degree horizontal and 20-degree vertical spreads', () => {
    const positions = readAccessor(0);
    assert.deepEqual(positions[0], [0, 0, 0]);
    const normals = readAccessor(1);
    const ring = positions.filter(
        ([, y, z], index) => y >= 0 && z === -60 && normals[index][2] > 0,
    );
    assert.ok(Math.max(...ring.map(([x]) => x)) > 21);
    assert.ok(Math.min(...ring.map(([x]) => x)) < -21);
    assert.ok(Math.max(...ring.map(([, y]) => y)) > 10);
    assert.ok(
        Math.abs(
            Math.max(...ring.map(([x]) => x)) / 60 -
                Math.tan((20 * Math.PI) / 180),
        ) < 0.00001,
    );
    assert.ok(
        Math.abs(
            Math.max(...ring.map(([, y]) => y)) / 60 -
                Math.tan((10 * Math.PI) / 180),
        ) < 0.00001,
    );
    for (const [x, y] of ring) {
        assert.ok(
            Math.abs(
                Math.hypot(
                    x / (60 * Math.tan((20 * Math.PI) / 180)),
                    y / (60 * Math.tan((10 * Math.PI) / 180)),
                ) - 1,
            ) < 0.00001,
        );
    }
    assert.ok(
        readAccessor(1).every(
            (normal) => Math.abs(Math.hypot(...normal) - 1) < 0.00001,
        ),
    );
    assert.deepEqual(readAccessor(2)[0], [0.5, 0]);
    const uvs = readAccessor(2);
    assert.ok(uvs.some(([u, v]) => u === 0 && v === 1));
    assert.ok(uvs.some(([u, v]) => u === 1 && v === 1));
    positions.forEach(([, , z], index) => {
        assert.ok(Math.abs(uvs[index][1] + z / 60) < 0.00001);
    });
});

test('filled beam closes both openings and clears the ground without flattening its lower rays', () => {
    const positions = readAccessor(0);
    const isGround = ([, y]) => Math.abs(y + 2.48) < 0.00001;
    assert.ok(
        positions.every(([, y, z]) => y >= -2.48001 && z >= -60 && z <= 0),
    );
    const ground = positions.filter(isGround);
    assert.ok(ground.length > 2);
    const firstContact = 2.48 / Math.tan((10 * Math.PI) / 180);
    assert.ok(
        Math.abs(Math.max(...ground.map(([, , z]) => z)) + firstContact) <
            0.00001,
    );
    assert.ok(
        ground.some(
            ([x, , z]) =>
                Math.abs(x) < 0.00001 && Math.abs(z + firstContact) < 0.00001,
        ),
    );
    assert.ok(ground.some(([, , z]) => z === -60));

    const indices = readAccessor(3).flat();
    const edges = new Map();
    let groundFaces = 0;
    let endFaces = 0;
    const vertexKey = (position) =>
        position.map((value) => Math.round(value * 100000)).join(',');
    for (let offset = 0; offset < indices.length; offset += 3) {
        const triangle = indices
            .slice(offset, offset + 3)
            .map((index) => positions[index]);
        const [a, b, c] = triangle;
        const ab = b.map((value, axis) => value - a[axis]);
        const ac = c.map((value, axis) => value - a[axis]);
        const cross = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        ];
        assert.ok(Math.hypot(...cross) > 0.00001, 'no degenerate triangles');
        assert.ok(
            cross[0] * (a[0] + b[0] + c[0]) +
                cross[1] * (a[1] + b[1] + c[1]) +
                cross[2] * (a[2] + b[2] + c[2] + 90) >
                0,
            'preserve outward winding',
        );
        if (triangle.every(isGround)) groundFaces++;
        if (triangle.every(([, , z]) => z === -60)) endFaces++;
        for (let edge = 0; edge < 3; edge++) {
            const endpoints = [triangle[edge], triangle[(edge + 1) % 3]];
            const key = endpoints.map(vertexKey).sort().join('|');
            const entry = edges.get(key) ?? { count: 0, endpoints };
            entry.count++;
            edges.set(key, entry);
        }
    }
    assert.ok(groundFaces > 0, 'the ground-cut underside is filled');
    assert.ok(endFaces > 0, 'the wide end is filled');
    for (const { count } of edges.values()) {
        assert.equal(
            count,
            2,
            'every welded edge belongs to exactly two faces',
        );
    }
});

test('beam material stays translucent with circumferential shading and a readable rim', () => {
    const material = document.materials[0];
    assert.equal(material.alphaMode, 'BLEND');
    assert.equal(material.doubleSided, true);
    assert.equal(material.pbrMetallicRoughness.baseColorTexture.index, 0);
    const view = document.bufferViews[document.images[0].bufferView];
    const png = model.subarray(
        binaryOffset + view.byteOffset,
        binaryOffset + view.byteOffset + view.byteLength,
    );
    assert.deepEqual(
        [...png.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(png.readUInt32BE(16), 64);
    assert.equal(png.readUInt32BE(20), 64);
    const data = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
    const stride = 64 * 4 + 1;
    const alphas = Array.from({ length: 64 }, (_, y) => data[y * stride + 4]);
    assert.equal(alphas[0], 155);
    assert.equal(alphas.at(-1), 105);
    assert.ok(alphas.every((alpha) => alpha >= 70 && alpha <= 155));
    assert.ok(alphas.at(-1) > alphas[59]);
    assert.ok(data[16 * 4 + 1] > data[48 * 4 + 1]);
    assert.deepEqual(
        data.subarray(1, 5),
        data.subarray(63 * 4 + 1, 64 * 4 + 1),
    );
    assert.ok(
        alphas
            .slice(0, 60)
            .every((value, index) => index === 0 || value <= alphas[index - 1]),
    );
});

test('native layer uses the bundled model and compass yaw without shadows or camera-facing alignment', () => {
    const { CameraViewConeModels, CameraViewConeModelLayer } = loadTourModule(
        new URL('../camera-view-cone-model.js', import.meta.url),
        {
            '@rnmapbox/maps': { Models: 'Models', ModelLayer: 'ModelLayer' },
            './constants': {
                MARKER_CONE_DIRECTION_PROPERTY_NAMES: directionProperties,
            },
            'react-native': {
                Platform: { OS: 'ios' },
                Image: {
                    resolveAssetSource: () => ({
                        uri: 'file:///camera-view-cone.glb',
                    }),
                },
            },
            '../../assets/map/camera-view-cone.glb': 'bundled-cone',
        },
    );
    assert.deepEqual(CameraViewConeModels().props.models, {
        'camera-view-cone': 'bundled-cone',
    });
    for (const direction of [0, 45, 90, 180, 270, 315]) {
        const layer = CameraViewConeModelLayer({
            id: 'cone',
            sourceID: 'markers',
            direction,
        });
        assert.equal(layer.type, 'ModelLayer');
        assert.equal(layer.props.sourceID, 'markers');
        assert.equal(layer.props.slot, undefined);
        assert.equal(layer.props.style.modelId, 'camera-view-cone');
        assert.deepEqual(layer.props.style.modelRotation, [0, 0, direction]);
        assert.deepEqual(layer.props.style.modelTranslation, [0, 0, 2.5]);
        const altitude = layer.props.style.modelTranslation[2];
        assert.ok(
            Math.abs(
                Math.min(...readAccessor(0).map(([, y]) => y + altitude)) -
                    0.02,
            ) < 0.00001,
        );
        assert.equal(layer.props.style.modelCastShadows, false);
        assert.equal(layer.props.style.modelReceiveShadows, false);
        assert.equal(layer.props.style.modelType, 'location-indicator');
        assert.equal(layer.props.style.modelEmissiveStrength, 0.95);
        assert.equal(
            CameraViewConeModelLayer({ isDarkMode: true }).props.style
                .modelEmissiveStrength,
            1,
        );
    }
});

test('Metro model URLs retain the asset path after Mapbox strips their query string', () => {
    const { CameraViewConeModels } = loadTourModule(
        new URL('../camera-view-cone-model.js', import.meta.url),
        {
            '@rnmapbox/maps': { Models: 'Models', ModelLayer: 'ModelLayer' },
            './constants': {
                MARKER_CONE_DIRECTION_PROPERTY_NAMES: directionProperties,
            },
            'react-native': {
                Platform: { OS: 'ios' },
                Image: {
                    resolveAssetSource: () => ({
                        uri: 'http://192.168.86.16:8081/assets/?unstable_path=.%2Fassets%2Fmap/camera-view-cone.glb?platform=android&hash=87e4a6124c52385650b3a58fcd68b8e8',
                    }),
                },
            },
            '../../assets/map/camera-view-cone.glb': 'bundled-cone',
        },
    );
    const uri = CameraViewConeModels().props.models['camera-view-cone'];
    assert.equal(
        uri.split('?')[0],
        'http://192.168.86.16:8081/assets/assets/map/camera-view-cone.glb',
    );
});
