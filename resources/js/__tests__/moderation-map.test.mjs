import { compileScript, parse } from '@vue/compiler-sfc';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { URL } from 'node:url';
import * as Vue from 'vue';
import * as moderation from '../moderation.js';
import { flagMapNodes } from '../moderationFlags.js';

const source = await readFile(
    new URL('../Components/Moderation/ModerationMap.vue', import.meta.url),
    'utf8',
);
const { descriptor } = parse(source);
const { content } = compileScript(descriptor, {
    id: 'moderation-map',
    inlineTemplate: true,
});
const code = content
    .replace(
        /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g,
        (_, bindings, source) =>
            `const ${bindings.replaceAll(' as ', ': ')} = dependencies[${JSON.stringify(source)}];`,
    )
    .replace('import.meta.env.VITE_MAPBOX_TOKEN', "'test-token'")
    .replace("import('mapbox-gl')", 'Promise.resolve(dependencies.mapbox)')
    .replace('export default', 'return');

function mountMap(props) {
    const calls = { fits: [], jumps: [], layers: [], sources: [] };
    const handlers = new Map();
    const map = {
        addControl() {},
        on(event, layer, handler) {
            handlers.set(
                handler ? `${event}:${layer}` : event,
                handler || layer,
            );
        },
        addSource(_id, source) {
            calls.sources.push(source.data);
        },
        getSource() {
            return { setData: (data) => calls.sources.push(data) };
        },
        addLayer(layer) {
            calls.layers.push(layer);
        },
        fitBounds(bounds, options) {
            calls.fits.push({ bounds, options });
        },
        jumpTo(options) {
            calls.jumps.push(options);
        },
        remove() {},
    };
    const MapComponent = new Function('dependencies', code)({
        vue: Vue,
        '@/moderation': moderation,
        mapbox: {
            default: {
                Map: class {
                    constructor() {
                        return map;
                    }
                },
                NavigationControl: class {},
            },
        },
    });
    const renderer = Vue.createRenderer({
        createElement: () => ({}),
        createText: () => ({}),
        createComment: () => ({}),
        insert() {},
        remove() {},
        setText() {},
        setElementText() {},
        parentNode: () => null,
        nextSibling: () => null,
        patchProp() {},
    });
    const state = Vue.reactive(props);
    const app = renderer.createApp({
        setup: () => () => Vue.h(MapComponent, state),
    });
    app.mount({});
    return { app, calls, handlers, state };
}

const node = { id: 200, longitude: -97.74, latitude: 30.27 };
const flags = [
    {
        node_id: 200,
        related_node_id: 300,
        evidence: {
            radius_meters: 25,
            locations: { 300: [-97.7401, 30.2701] },
        },
    },
];

test('duplicate map fits both locations, renders their labels and selects the other node', async (t) => {
    let selected;
    const { app, calls, handlers } = mountMap({
        nodes: flagMapNodes(node, flags),
        onNode: (id) => {
            selected = id;
        },
    });
    t.after(() => app.unmount());
    await setImmediate();
    handlers.get('load')();
    assert.deepEqual(calls.fits[0]?.bounds, [
        [-97.7401, 30.27],
        [-97.74, 30.2701],
    ]);
    assert.equal(calls.fits[0].options.maxZoom, 19);
    const points = calls.sources[0].features;
    assert.deepEqual(
        points.map((feature) => feature.properties.label),
        ['Node 200', 'Node 300 (duplicate)'],
    );
    const labels = calls.layers.find(
        (layer) => layer.id === 'moderation-node-labels',
    );
    assert.equal(labels?.type, 'symbol');
    assert.deepEqual(labels.layout['text-field'], ['get', 'label']);
    handlers.get('click:moderation-points')({ features: [points[1]] });
    assert.equal(selected, 300);
});

test('map refits when duplicate evidence arrives after mount while preserving explicit area bounds', async (t) => {
    const { app, calls, handlers, state } = mountMap({ nodes: [node] });
    t.after(() => app.unmount());
    await setImmediate();
    handlers.get('load')();
    assert.deepEqual(calls.jumps[0].center, [-97.74, 30.27]);
    state.nodes = flagMapNodes(node, flags);
    await Vue.nextTick();
    assert.deepEqual(calls.fits.at(-1).bounds, [
        [-97.7401, 30.27],
        [-97.74, 30.2701],
    ]);
    assert.equal(calls.sources.at(-1).features.length, 2);
    state.bounds = [-98, 30, -97, 31];
    await Vue.nextTick();
    assert.deepEqual(calls.fits.at(-1).bounds, [
        [-98, 30],
        [-97, 31],
    ]);
});
