import { compile } from '@vue/compiler-dom';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as Vue from 'vue';

const source = readFileSync(
    new URL('../Pages/Map.vue', import.meta.url),
    'utf8',
);
const { descriptor } = parse(source);

function createRouteHarness(post) {
    const functionSource = source.slice(
        source.indexOf('async function maybeLoadDirectionsRoute()'),
        source.indexOf('function startDirectionsLoadingTimer()'),
    );
    const context = {
        axios: { post },
        avoidanceMode: Vue.ref('directional'),
        avoidBufferMeters: Vue.ref(125),
        allowAlprNearStartDestination: Vue.ref(true),
        directionsError: Vue.ref(''),
        directionsIsLoading: Vue.ref(false),
        directionsRoute: Vue.ref(null),
        routePanelIsCollapsed: Vue.ref(false),
        selectedRouteKey: Vue.ref('ideal'),
        GENERIC_ALPR_PROFILE: {},
        directionRouteCoordinates: () => [
            [-88, 43],
            [-88.1, 43.1],
        ],
        directionWaypointsAreReady: () => true,
        clearLoadedDirectionsRoute: () => {},
        startDirectionsLoadingTimer: () => {},
        stopDirectionsLoadingTimer: () => {},
        normalizeDirectionsRouteResponse: (route) => route,
        syncRouteSources: () => {},
        updateRouteLayerStyles: () => {},
        fitMapToSelectedRoute: () => {},
    };
    const getDirections = new Function(
        ...Object.keys(context),
        `let directionsRequestId = 0; ${functionSource}; return maybeLoadDirectionsRoute;`,
    )(...Object.values(context));
    return { context, getDirections };
}

function findNode(node, type) {
    if (node?.type === type) return node;
    for (const child of Array.isArray(node?.children) ? node.children : []) {
        const found = findNode(child, type);
        if (found) return found;
    }
    return null;
}

test('compiles the map page and renders a labeled keyboard-native shape selector', async () => {
    compileScript(descriptor, { id: 'map-avoidance' });
    assert.deepEqual(
        compileTemplate({
            source: descriptor.template.content,
            filename: 'Map.vue',
            id: 'map-avoidance',
        }).errors,
        [],
    );
    const template = source.match(
        /<div class="mb-4">\s*<label[\s\S]*?for="alpr-avoidance-mode"[\s\S]*?<\/div>/,
    )?.[0];
    assert.ok(template);
    const render = new Function('Vue', compile(template).code)(Vue);
    const requests = [];
    const harness = createRouteHarness(async (_url, body) => {
        requests.push(body);
        return { data: { result: { selectedRouteKey: 'ideal' } } };
    });
    const context = Vue.proxyRefs({
        avoidanceMode: harness.context.avoidanceMode,
        maybeLoadDirectionsRoute: harness.getDirections,
    });
    // Rendering the real template preserves its v-model and change handler.
    let tree;
    const html = await renderToString(
        Vue.createSSRApp({
            render() {
                tree = render(context, []);
                return tree;
            },
        }),
    );
    assert.match(html, /ALPR avoidance shape/);
    const select = findNode(tree, 'select');
    assert.equal(findNode(tree, 'label').props.for, select.props.id);
    assert.equal(
        select.props['aria-describedby'],
        findNode(tree, 'p').props.id,
    );
    assert.deepEqual(
        select.children.map((option) => [
            option.props.value,
            option.children.trim(),
        ]),
        [
            ['directional', 'Directional cones'],
            ['circular', 'Circular radius'],
        ],
    );
    await select.props.onChange();
    select.props['onUpdate:modelValue']('circular');
    await select.props.onChange();
    assert.deepEqual(
        requests.map((body) => body.avoidance_mode),
        ['directional', 'circular'],
    );
    assert.equal(requests[1].avoid_buffer, 125);
});

test('a late directional response cannot replace a newer circular route', async () => {
    const pending = [];
    const harness = createRouteHarness(
        (_url, body) =>
            new Promise((resolve, reject) =>
                pending.push({ body, resolve, reject }),
            ),
    );
    const first = harness.getDirections();
    harness.context.avoidanceMode.value = 'circular';
    const second = harness.getDirections();
    pending[1].resolve({
        data: { result: { mode: 'circular', selectedRouteKey: 'ideal' } },
    });
    await second;
    pending[0].resolve({
        data: { result: { mode: 'directional', selectedRouteKey: 'ideal' } },
    });
    await first;
    assert.equal(harness.context.directionsRoute.value.mode, 'circular');
    assert.equal(harness.context.directionsIsLoading.value, false);
});

test('a stale request failure cannot clear the newer route or its loading state', async () => {
    const pending = [];
    const harness = createRouteHarness(
        () =>
            new Promise((resolve, reject) => pending.push({ resolve, reject })),
    );
    const first = harness.getDirections();
    harness.context.avoidanceMode.value = 'circular';
    const second = harness.getDirections();
    pending[0].reject(new Error('older request failed'));
    await first;
    assert.equal(harness.context.directionsIsLoading.value, true);
    assert.equal(harness.context.directionsError.value, '');
    pending[1].resolve({
        data: { result: { mode: 'circular', selectedRouteKey: 'ideal' } },
    });
    await second;
    assert.equal(harness.context.directionsRoute.value.mode, 'circular');
});
