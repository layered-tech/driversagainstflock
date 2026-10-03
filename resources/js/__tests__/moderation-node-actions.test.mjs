import { compileScript, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import * as Vue from 'vue';

const source = await readFile(
    new URL('../Components/Moderation/NodeActions.vue', import.meta.url),
    'utf8',
);
const { descriptor } = parse(source);
const { content } = compileScript(descriptor, {
    id: 'NodeActions',
    inlineTemplate: true,
});
const code = content
    .replace(
        /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g,
        (_, bindings, name) =>
            `const ${bindings.replaceAll(' as ', ': ')} = dependencies[${JSON.stringify(name)}];`,
    )
    .replace('export default', 'return');
globalThis.Document = class {};
globalThis.ShadowRoot = class {};
const flag = { id: 10, node_id: 200, related_node_id: 100, status: 'open' };
function harness(response) {
    const requests = [];
    let form;
    let reloads = 0;
    const component = new Function('dependencies', code)({
        vue: Vue,
        '@inertiajs/vue3': {
            router: {
                reload() {
                    reloads++;
                },
            },
            useHttp(data) {
                form = Vue.reactive({
                    ...data,
                    processing: false,
                    errors: {},
                    async get(url) {
                        requests.push(['GET', url]);
                        return response;
                    },
                    async post(url) {
                        requests.push([
                            'POST',
                            url,
                            {
                                action: form.action,
                                confirmed: form.confirmed,
                                version: form.version,
                                tags: { ...form.tags },
                                latitude: form.latitude,
                                longitude: form.longitude,
                            },
                        ]);
                        return {
                            node: { version: 3 },
                            changeset_id: 999,
                            closed: true,
                            verified: true,
                        };
                    },
                });
                return form;
            },
        },
    });
    const elements = [];
    const renderer = Vue.createRenderer({
        createElement(tag) {
            const node = {
                tag,
                props: {},
                addEventListener() {},
                removeEventListener() {},
                getRootNode() {
                    return {};
                },
                options: [],
                tagName: tag.toUpperCase(),
            };
            elements.push(node);
            return node;
        },
        createText: () => ({}),
        createComment: () => ({}),
        insert() {},
        remove() {},
        setText() {},
        setElementText() {},
        parentNode: () => null,
        nextSibling: () => null,
        patchProp(node, key, previous, value) {
            node.props[key] = value;
        },
    });
    const app = renderer.createApp(component, { flag, nodeId: 200 });
    app.provide('route', (name, params) => `${name}:${JSON.stringify(params)}`);
    app.mount({});
    return {
        component,
        elements,
        requests,
        app,
        get form() {
            return form;
        },
        get reloads() {
            return reloads;
        },
    };
}

test('reports expose an explicit edit action without loading or writing OSM automatically', async () => {
    const h = harness();
    assert.deepEqual(h.requests, []);
    const html = await renderToString(
        Vue.createSSRApp(h.component, { flag, nodeId: 200 }).provide(
            'route',
            () => '/edit',
        ),
    );
    assert.match(html, /Edit \/ remove node/);
    assert.doesNotMatch(html, /<form|checkbox/);
    h.app.unmount();
});

test('identity-only sessions are directed to separate OSM edit authorization', async () => {
    const h = harness({ authorized: false, actions: ['remove'], tag_keys: [] });
    await h.elements
        .find((node) => node.props['aria-label'] === 'Edit reported node 200')
        .props.onClick();
    await Vue.nextTick();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0][0], 'GET');
    assert.ok(
        h.elements.some(
            (node) =>
                node.tag === 'a' &&
                node.props.href.includes('moderation.osm.edit.authorize'),
        ),
    );
    assert.ok(!h.elements.some((node) => node.tag === 'form'));
    h.app.unmount();
});

test('duplicate removal uses the loaded current version and requires an explicit confirmation', async () => {
    const h = harness({
        authorized: true,
        actions: ['location', 'remove'],
        tag_keys: [],
        node: { version: 2, lat: 30.5, lon: -97.5, tags: {} },
    });
    await h.elements.find((node) => node.props['aria-label']).props.onClick();
    await Vue.nextTick();
    assert.equal(h.form.action, 'remove');
    const form = h.elements.find((node) => node.tag === 'form');
    const event = { preventDefault() {} };
    await form.props.onSubmit(event);
    assert.equal(h.requests.length, 1);
    assert.equal(
        h.elements.find((node) => node.props.type === 'submit').props.disabled,
        true,
    );
    h.form.confirmed = true;
    h.form.comment = 'Survey confirmed duplicate';
    await Vue.nextTick();
    await form.props.onSubmit(event);
    await Vue.nextTick();
    assert.equal(h.requests[1][0], 'POST');
    assert.deepEqual(h.requests[1][2], {
        action: 'remove',
        confirmed: true,
        version: 2,
        tags: {},
        latitude: 30.5,
        longitude: -97.5,
    });
    assert.equal(h.reloads, 1);
    h.app.unmount();
});

test('tag and road reports offer only the actions and tag fields allowed by their rule', async () => {
    for (const [actions, keys] of [
        [['tags'], ['operator', 'mount']],
        [['location'], []],
    ]) {
        const h = harness({
            authorized: true,
            actions,
            tag_keys: keys,
            node: {
                version: 4,
                lat: 30.5,
                lon: -97.5,
                tags: { name: 'Unrelated', operator: 'Flock' },
            },
        });
        await h.elements
            .find((node) => node.props['aria-label'])
            .props.onClick();
        await Vue.nextTick();
        assert.equal(h.form.action, actions[0]);
        assert.deepEqual(Object.keys(h.form.tags), keys);
        assert.equal(
            h.elements.filter((node) => node.tag === 'option').length,
            1,
        );
        assert.ok(
            !h.elements.some(
                (node) =>
                    node.tag === 'option' && node.props.value === 'remove',
            ),
        );
        h.app.unmount();
    }
});
