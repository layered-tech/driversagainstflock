import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    ALPR_IMAGE_URLS,
    ALPR_WEB_LAYER_IDS,
    getMarkerAlprSymbolImage,
    loadAlprMarkerImages,
    makeAlprMarkerLayer,
} from '../alpr-markers.js';
import { CAMERA_MANUFACTURERS } from '../../../expo/lib/osm/camera-manufacturers.js';
import {
    ALPR_SYMBOL_ICON_OFFSETS,
    ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
} from '../../../expo/lib/osm/camera-marker-style.js';

function mapHarness() {
    const images = new Map();
    const layers = new Map();
    const paint = new Map();
    const requests = [];
    let source = {};
    return {
        images,
        layers,
        paint,
        requests,
        getSource: () => source,
        replaceStyle: () => {
            source = {};
            images.clear();
            layers.clear();
        },
        hasImage: (name) => images.has(name),
        addImage: (name, image, options) =>
            images.set(name, { image, options }),
        getLayer: (id) => layers.get(id),
        addLayer: (layer) => layers.set(layer.id, layer),
        setPaintProperty: (id, key, value) => paint.set(`${id}:${key}`, value),
        loadImage: (url, callback) => requests.push({ url, callback }),
    };
}

test('web uses the mobile manufacturer tags, fallback, images and dimensions', () => {
    for (const { tags, imageName } of CAMERA_MANUFACTURERS) {
        assert.equal(
            getMarkerAlprSymbolImage({ properties: { osm_nodes: [{ tags }] } }),
            imageName,
        );
        const image = readFileSync(new URL(ALPR_IMAGE_URLS[imageName]));
        assert.equal(image.readUInt32BE(16), 1672);
        const layer = makeAlprMarkerLayer(imageName);
        assert.equal(layer.minzoom, 16);
        assert.deepEqual(
            layer.layout['icon-size'],
            ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
        );
        assert.deepEqual(
            layer.layout['icon-offset'],
            ALPR_SYMBOL_ICON_OFFSETS[imageName].map((v) => v / 2),
        );
        assert.deepEqual(layer.filter[1], ['!', ['has', 'point_count']]);
    }
    assert.equal(
        getMarkerAlprSymbolImage({
            properties: {
                osm_nodes: [
                    {
                        tags: {
                            manufacturer: 'Axon',
                            'manufacturer:wikidata': 'Q108485435',
                        },
                    },
                ],
            },
        }),
        'generic-alpr',
    );
    assert.equal(
        getMarkerAlprSymbolImage({
            properties: {
                osm_nodes: [{ tags: { 'surveillance:type': 'ALPR' } }],
            },
        }),
        'generic-alpr',
    );
    assert.equal(
        getMarkerAlprSymbolImage({
            properties: {
                osm_nodes: [{ tags: { 'surveillance:type': 'camera' } }],
            },
        }),
        null,
    );
});

test('loads each image at 2x density and replaces circles only after successful registration', async () => {
    const map = mapHarness();
    const pending = loadAlprMarkerImages(map);
    assert.equal(map.images.size, 0);
    assert.equal(map.paint.size, 0);
    map.requests.forEach(({ callback }, index) =>
        callback(index === 0 ? new Error('offline') : null, {
            width: 1672,
            height: 941,
        }),
    );
    const loaded = await pending;
    assert.equal(loaded.filter(Boolean).length, 7);
    assert.equal(map.images.size, 7);
    assert.equal(map.layers.size, 7);
    for (const { options } of map.images.values())
        assert.equal(options.pixelRatio, 2);
    const opacity = map.paint.get('daf-marker-dot:circle-opacity');
    assert.equal(opacity[3], 16);
    const names = opacity[4][1][2][1];
    assert.ok(!names.includes('falcon-alpr'));
    assert.ok(names.includes('axon-alpr'));
    assert.deepEqual(
        map.paint.get('daf-marker-dot:circle-stroke-opacity'),
        opacity,
    );
});

test('ignores stale image callbacks after style changes and reinstalls on the new style', async () => {
    const map = mapHarness();
    const old = loadAlprMarkerImages(map);
    map.replaceStyle();
    map.requests.forEach(({ callback }) => callback(null, {}));
    assert.ok((await old).every((loaded) => !loaded));
    assert.equal(map.images.size, 0);
    map.requests.length = 0;
    const current = loadAlprMarkerImages(map);
    map.requests.forEach(({ callback }) => callback(null, {}));
    assert.ok((await current).every(Boolean));
    assert.deepEqual([...map.layers.keys()], ALPR_WEB_LAYER_IDS);
    let active = false;
    const abandoned = loadAlprMarkerImages(map, () => active);
    assert.ok((await abandoned).every((loaded) => !loaded));
});
