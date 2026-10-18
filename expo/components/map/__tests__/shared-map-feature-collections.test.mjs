import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const modules = new Map();
const nativeModules = {
    'crashlytics.js': { addCrashlyticsLog() {} },
    'config.js': {},
    'api-mocks.js': {},
};

function loadModule(url) {
    if (url.pathname.endsWith('.png')) return {};
    const nativeModule = nativeModules[url.pathname.split('/').at(-1)];
    if (nativeModule) return nativeModule;
    if (modules.has(url.href)) return modules.get(url.href).exports;

    const module = { exports: {} };
    modules.set(url.href, module);
    const source = transformSync(readFileSync(url, 'utf8'), {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            transformModulesCommonJs,
        ],
    }).code;
    new Function('require', 'module', 'exports', source)(
        (specifier) =>
            specifier === '@rnmapbox/maps'
                ? { SymbolLayer: 'SymbolLayer' }
                : specifier === 'react/jsx-runtime'
                  ? {
                        jsx: (type, props) => ({ type, props }),
                        jsxs: (type, props) => ({ type, props }),
                    }
                  : specifier === 'expo/fetch'
                    ? {}
                    : loadModule(
                          new URL(
                              /\.(?:js|png)$/.test(specifier)
                                  ? specifier
                                  : `${specifier}.js`,
                              url,
                          ),
                      ),
        module,
        module.exports,
    );
    return module.exports;
}

const { makeMarkerFeatureCollection } = loadModule(
    new URL('../geo.js', import.meta.url),
);
const { makeWazePoliceAlertFeatureCollection } = loadModule(
    new URL('../waze-alerts-api.js', import.meta.url),
);

test('phone and car share marker geometry and direction parsing for each published inventory', () => {
    let directionReads = 0;
    const marker = {
        location: [-97, 30],
        properties: {
            id: 'camera',
            get direction() {
                directionReads += 1;
                return '90;270';
            },
            osm_nodes: [{ tags: { 'brand:wikidata': 'Q108485435' } }],
        },
    };
    const markers = [marker, { properties: { id: 'invalid' } }];
    const phone = makeMarkerFeatureCollection(markers);
    const initialReads = directionReads;
    const car = makeMarkerFeatureCollection(markers);

    assert.equal(car, phone);
    assert.equal(directionReads, initialReads);
    assert.equal(phone.features.length, 1);
    assert.equal(phone.features[0].properties.coneDirection0, 90);
    assert.equal(phone.features[0].properties.coneDirection1, 270);
    assert.deepEqual(
        phone.features[0].properties.coneDirection0Rotation,
        [0, 0, 90],
    );
    assert.deepEqual(
        phone.features[0].properties.coneDirection1Rotation,
        [0, 0, 270],
    );
    assert.equal(phone.features[0].properties.showsAlprSymbol, true);

    const updated = makeMarkerFeatureCollection([
        { ...marker, location: [-96, 31] },
    ]);
    assert.notEqual(updated, phone);
    assert.deepEqual(updated.features[0].geometry.coordinates, [-96, 31]);
    assert.deepEqual(phone.features[0].geometry.coordinates, [-97, 30]);
});

test('3D cone rotations preserve normalization and the eight-direction limit without inventing unknown directions', () => {
    const collection = makeMarkerFeatureCollection([
        {
            location: [-97, 30],
            properties: {
                id: 'many',
                direction: '-90;0;45;90;135;180;225;315;22.5',
            },
        },
        { location: [-97, 31], properties: { id: 'unknown' } },
    ]);
    const rotations = Object.entries(collection.features[0].properties).filter(
        ([key]) => key.endsWith('Rotation'),
    );
    assert.equal(rotations.length, 8);
    assert.deepEqual(
        rotations.map(([, value]) => value[2]),
        [270, 0, 45, 90, 135, 180, 225, 315],
    );
    assert.equal(
        Object.keys(collection.features[1].properties).some((key) =>
            key.endsWith('Rotation'),
        ),
        false,
    );
});

test('police feature derivation reuses the shared alert snapshot and refreshes replacements', () => {
    let coordinateReads = 0;
    const alert = {
        id: 'police',
        get coordinate() {
            coordinateReads += 1;
            return [-97, 30];
        },
        street: 'First Street',
        numThumbsUp: 2,
    };
    const alerts = [alert];
    const first = makeWazePoliceAlertFeatureCollection(alerts);
    const initialReads = coordinateReads;

    assert.equal(makeWazePoliceAlertFeatureCollection(alerts), first);
    assert.equal(coordinateReads, initialReads);
    const updated = makeWazePoliceAlertFeatureCollection([
        { ...alert, numThumbsUp: 3 },
    ]);
    assert.equal(updated.features[0].properties.numThumbsUp, 3);
    assert.equal(first.features[0].properties.numThumbsUp, 2);
});

const { getMarkerAlprSymbolImage, nodeShowsAlprSymbol } = loadModule(
    new URL('../geo.js', import.meta.url),
);

const brandCases = [
    [
        'node 12634608637 rejects conflicting Axon and Flock identity',
        {
            manufacturer: 'Axon',
            'manufacturer:wikidata': 'Q108485435',
            'surveillance:type': 'ALPR',
            direction: '180',
        },
        'generic-alpr',
    ],
    [
        'brand name conflicts with Wikidata',
        {
            brand: 'Genetec',
            'brand:wikidata': 'Q634815',
        },
        'generic-alpr',
    ],

    ['Genetec manufacturer', { manufacturer: 'Genetec' }, 'genetec-alpr'],
    ['Genetec brand', { brand: ' GENETEC ' }, 'genetec-alpr'],
    ['Axon manufacturer', { manufacturer: 'Axon' }, 'axon-alpr'],
    ['Axon brand', { brand: 'Axon Enterprise' }, 'axon-alpr'],
    ['Vigilant brand', { brand: 'Vigilant Solutions' }, 'motorola-alpr'],
    [
        'conflicting new brands',
        { manufacturer: 'Genetec', brand: 'Axon' },
        'generic-alpr',
    ],
    [
        'Genetec CCTV',
        { manufacturer: 'Genetec', 'surveillance:type': 'camera' },
        null,
    ],

    ['Flock manufacturer', { manufacturer: 'Flock Safety' }, 'falcon-alpr'],
    ['Flock brand', { brand: ' flock ' }, 'falcon-alpr'],
    [
        'Flock Wikidata',
        { 'manufacturer:wikidata': 'Q108485435' },
        'falcon-alpr',
    ],
    [
        'Motorola manufacturer',
        { manufacturer: 'Motorola Solutions' },
        'motorola-alpr',
    ],
    ['Motorola brand', { brand: ' MOTOROLA ' }, 'motorola-alpr'],
    ['Motorola Wikidata', { 'brand:wikidata': 'Q634815' }, 'motorola-alpr'],
    [
        'semicolon Wikidata',
        { 'manufacturer:wikidata': 'Q1; Q634815' },
        'motorola-alpr',
    ],
    [
        'other ALPR',
        { manufacturer: 'Other', 'surveillance:type': 'ALPR' },
        'generic-alpr',
    ],
    ['unknown ANPR', { 'surveillance:type': 'anpr' }, 'generic-alpr'],
    [
        'conflicting brands',
        { manufacturer: 'Flock Safety', brand: 'Motorola' },
        'generic-alpr',
    ],
    [
        'CCTV with known brand',
        { manufacturer: 'Motorola Solutions', 'surveillance:type': 'camera' },
        null,
    ],
    ['unknown camera', {}, null],
    [
        'unrelated manufacturer',
        { manufacturer: 'Flock Safety Accessories' },
        null,
    ],
];

for (const [label, tags, expected] of brandCases) {
    test(`map image selection: ${label}`, () => {
        const node = { tags };
        const marker = {
            location: [-97, 30],
            properties: { osm_nodes: [node] },
        };
        assert.equal(getMarkerAlprSymbolImage(marker), expected);
        assert.equal(nodeShowsAlprSymbol(node), expected !== null);
        const feature = makeMarkerFeatureCollection([marker]).features[0];
        assert.equal(feature.properties.alprSymbolImage, expected);
        assert.equal(feature.properties.showsAlprSymbol, expected !== null);
    });
}

test('mixed-brand locations use the neutral image regardless of node order', () => {
    const nodes = [
        { tags: { manufacturer: 'Flock Safety' } },
        { tags: { manufacturer: 'Motorola Solutions' } },
    ];
    for (const osm_nodes of [nodes, [...nodes].reverse()]) {
        assert.equal(
            getMarkerAlprSymbolImage({ properties: { osm_nodes } }),
            'generic-alpr',
        );
    }
    assert.equal(getMarkerAlprSymbolImage(null), null);
    assert.equal(
        getMarkerAlprSymbolImage({ properties: { osm_nodes: [null] } }),
        null,
    );
});

test('each actual contribution preset resolves to its own registered map image', () => {
    const { CAMERA_PRESETS, getPresetTags } = loadModule(
        new URL('../../../lib/osm/camera-presets.js', import.meta.url),
    );
    const { ALPR_SYMBOL_IMAGES } = loadModule(
        new URL('../constants.js', import.meta.url),
    );
    const expected = {
        flock: 'falcon-alpr',
        motorola: 'motorola-alpr',
        genetec: 'genetec-alpr',
        axon: 'axon-alpr',
        leonardo: 'leonardo-alpr',
        neology: 'neology-alpr',
        verkada: 'verkada-alpr',
        generic: 'generic-alpr',
    };
    for (const { value } of CAMERA_PRESETS.filter(
        ({ value }) => value !== 'custom',
    )) {
        const name = getMarkerAlprSymbolImage({
            properties: { osm_nodes: [{ tags: getPresetTags(value) }] },
        });
        assert.equal(name, expected[value], value);
        assert.ok(Object.hasOwn(ALPR_SYMBOL_IMAGES, name));
    }
});

test('ALPR marker assets use matching transparent PNG canvases', () => {
    const files = [
        'falcon-alpr',
        'motorola-alpr',
        'genetec-alpr',
        'axon-alpr',
        'generic-alpr',
        'leonardo-alpr',
        'neology-alpr',
        'verkada-alpr',
    ];
    const dimensions = files.map((name) => {
        const png = readFileSync(
            new URL(`../../../assets/map/${name}.png`, import.meta.url),
        );
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png[25], 6, `${name} must retain RGBA transparency`);
        return [png.readUInt32BE(16), png.readUInt32BE(20)];
    });
    for (const size of dimensions) {
        assert.deepEqual(size, dimensions[0]);
    }
});

test('each camera pole base meets the cone origin throughout the visible zoom range', () => {
    const {
        ALPR_SYMBOL_ICON_OFFSETS: offsets,
        ALPR_SYMBOL_ICON_SIZE_EXPRESSION: sizes,
    } = loadModule(new URL('../constants.js', import.meta.url));
    // Measured visible pole bases in the 1672 x 941 source PNGs.
    const poleBases = {
        'falcon-alpr': [924, 914],
        'motorola-alpr': [829.5, 924],
        'genetec-alpr': [567, 929],
        'axon-alpr': [1062.5, 880],
        'generic-alpr': [1032.5, 917],
        'leonardo-alpr': [797, 911],
        'neology-alpr': [983.5, 888],
        'verkada-alpr': [633, 923],
    };
    for (const [image, [x, y]] of Object.entries(poleBases)) {
        const [dx, dy] = offsets[image];
        for (const size of [
            sizes[4],
            (sizes[4] + sizes[6]) / 2,
            sizes[6],
            sizes[8],
        ]) {
            assert.equal(
                (x - 1672 / 2 + dx) * size,
                0,
                `${image} horizontal anchor`,
            );
            assert.equal((y - 941 + dy) * size, 0, `${image} vertical anchor`);
        }
    }
});

test('each guide identity is recognized by name or Wikidata and conflicts remain generic', () => {
    const { CAMERA_MANUFACTURERS } = loadModule(
        new URL('../../../lib/osm/camera-manufacturers.js', import.meta.url),
    );
    for (const { tags, imageName } of CAMERA_MANUFACTURERS) {
        for (const identity of [
            tags,
            { manufacturer: tags.manufacturer },
            ...(tags['manufacturer:wikidata']
                ? [{ 'manufacturer:wikidata': tags['manufacturer:wikidata'] }]
                : []),
        ]) {
            assert.equal(
                getMarkerAlprSymbolImage({
                    properties: {
                        osm_nodes: [
                            {
                                tags: {
                                    'surveillance:type': 'ALPR',
                                    ...identity,
                                },
                            },
                        ],
                    },
                }),
                imageName,
            );
        }
    }
    assert.equal(
        getMarkerAlprSymbolImage({
            properties: {
                osm_nodes: [
                    {
                        tags: {
                            manufacturer: 'Axon Enterprise',
                            'manufacturer:wikidata': 'Q108485435',
                        },
                    },
                ],
            },
        }),
        'generic-alpr',
    );
});

test('each map manufacturer has one aspect-preserving layer with its own fixed image and pole offset', () => {
    const { renderAlprMarkerLayers } = loadModule(
        new URL('../alpr-marker-layers.js', import.meta.url),
    );
    const { ALPR_SYMBOL_IMAGES, ALPR_SYMBOL_ICON_OFFSETS } = loadModule(
        new URL('../constants.js', import.meta.url),
    );
    const layers = renderAlprMarkerLayers({
        idPrefix: 'preview',
        sourceID: 'preview',
        slot: 'top',
    });
    assert.equal(layers.length, 8);
    assert.equal(
        new Set(layers.map(({ props }) => props.style.iconImage)).size,
        8,
    );
    for (const { props } of layers) {
        assert.ok(Object.hasOwn(ALPR_SYMBOL_IMAGES, props.style.iconImage));
        assert.deepEqual(
            props.style.iconOffset,
            ALPR_SYMBOL_ICON_OFFSETS[props.style.iconImage].map(
                (value) =>
                    value / ALPR_SYMBOL_IMAGES[props.style.iconImage].scale,
            ),
        );
        assert.equal(props.style.iconTextFit, 'none');
        assert.equal(props.style.iconPitchAlignment, 'viewport');
        assert.equal(props.style.iconRotationAlignment, 'viewport');
        assert.deepEqual(props.filter.at(-1), [
            '==',
            ['get', 'alprSymbolImage'],
            props.style.iconImage,
        ]);
    }
});

test('registered camera corners survive Mapbox signed 16-bit packing without mirroring', () => {
    const { ALPR_SYMBOL_IMAGES } = loadModule(
        new URL('../constants.js', import.meta.url),
    );
    const { renderAlprMarkerLayers } = loadModule(
        new URL('../alpr-marker-layers.js', import.meta.url),
    );
    for (const { props } of renderAlprMarkerLayers({
        idPrefix: 'packing',
        sourceID: 'packing',
    })) {
        const name = props.style.iconImage;
        const png = readFileSync(
            new URL(`../../../assets/map/${name}.png`, import.meta.url),
        );
        const density = ALPR_SYMBOL_IMAGES[name].scale ?? 1;
        const width = png.readUInt32BE(16) / density;
        const height = png.readUInt32BE(20) / density;
        const [dx, dy] = props.style.iconOffset;
        const corners = [-width / 2 + dx, width / 2 + dx, -height + dy, dy];
        // Mapbox's SymbolProgramBase stores round(corner * 32) in int16_t.
        const decoded = Array.from(
            Int16Array.from(corners, (value) => Math.round(value * 32)),
            (value) => value / 32,
        );
        for (let index = 0; index < corners.length; index += 1) {
            assert.ok(
                Math.abs(decoded[index] - corners[index]) <= 1 / 64,
                `${name} corner ${index} overflowed: ${corners[index]} -> ${decoded[index]}`,
            );
        }
        assert.ok(
            decoded[1] > decoded[0],
            `${name} must not mirror horizontally`,
        );
        assert.ok(
            Math.abs(decoded[1] - decoded[0] - width) <= 1 / 32,
            `${name} must preserve width`,
        );
    }
});

test('image density compensation preserves the requested display size at all zoom stops', () => {
    const { ALPR_SYMBOL_IMAGES, ALPR_SYMBOL_ICON_SIZE_EXPRESSION } = loadModule(
        new URL('../constants.js', import.meta.url),
    );
    for (const registration of Object.values(ALPR_SYMBOL_IMAGES)) {
        assert.equal(registration.scale, 2);
        assert.ok(registration.image);
        for (const [index, previousSize] of [
            [4, 0.063],
            [6, 0.0805],
            [8, 0.098],
        ]) {
            assert.equal(
                ALPR_SYMBOL_ICON_SIZE_EXPRESSION[index] / registration.scale,
                previousSize,
            );
        }
    }
});
