import { compileScript, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import * as Vue from 'vue';
import * as moderation from '../moderation.js';
import * as flags from '../moderationFlags.js';

const Link = {
    setup:
        (_, { slots, attrs }) =>
        () =>
            Vue.h('a', attrs, slots.default?.()),
};
async function component(name, dependencies) {
    const { descriptor } = parse(
        await readFile(
            new URL(`../Components/Moderation/${name}.vue`, import.meta.url),
            'utf8',
        ),
    );
    const { content } = compileScript(descriptor, {
        id: name,
        inlineTemplate: true,
    });
    const code = content
        .replace(
            /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g,
            (_, bindings, source) => {
                const binding = bindings.trim().startsWith('{')
                    ? bindings.replaceAll(' as ', ': ')
                    : `{ default: ${bindings} }`;
                return `const ${binding} = dependencies[${JSON.stringify(source)}];`;
            },
        )
        .replace('export default', 'return');
    return new Function('dependencies', code)({
        vue: Vue,
        '@inertiajs/vue3': { Link },
        ...dependencies,
    });
}
const FlagLabel = await component('FlagLabel', {});
const NodeLink = await component('NodeLink', {});
const NodeActions = await component('NodeActions', {
    '@inertiajs/vue3': {
        router: {},
        useHttp: (data) =>
            Vue.reactive({ ...data, processing: false, errors: {} }),
    },
});
const FlagDetails = await component('FlagDetails', {
    '@/Components/Moderation/NodeActions.vue': { default: NodeActions },
    '@/Components/Moderation/FlagLabel.vue': { default: FlagLabel },
    '@/Components/Moderation/NodeLink.vue': { default: NodeLink },
    '@/moderationFlags': flags,
});
const row = {
    id: 200,
    osm_version: 2,
    osm_changeset_id: 10,
    tags: {},
    visible: true,
    direction: null,
    changed_at: '2020-01-01T00:00:00Z',
    flags: [
        {
            id: 1,
            source: 'alpr_presence',
            status: 'open',
            evidence: {
                report_count: 2,
                first_report_at: '2026-09-21T21:34:30Z',
                latest_report_at: '2026-09-21T22:05:20Z',
            },
        },
        {
            id: 2,
            source: 'rule',
            status: 'open',
            stale: true,
            rule_id: 5,
            rule: { name: 'Require mount', severity: 'High' },
            evidence: { missing_tags: ['mount'] },
            created_at: '2026-09-20T00:00:00Z',
            evaluated_at: '2026-09-21T22:00:00Z',
        },
    ],
};
const reports = {
    total: 2,
    data: [
        {
            id: 10,
            platform: 'android_auto',
            user_id: 98765,
            occurred_at: '2026-09-21T21:34:30Z',
            received_at: '2026-09-21T21:34:31Z',
        },
        {
            id: 11,
            platform: 'carplay',
            occurred_at: '2026-09-21T22:05:20Z',
            received_at: '2026-09-21T22:05:22Z',
        },
    ],
};
const NodeListing = await component('NodeListing', {
    '@/Components/Moderation/FlagDetails.vue': { default: FlagDetails },
    '@/moderationFlags': flags,
    '@/moderation': moderation,
    '@/Components/Daf/DafIcon.vue': { default: () => Vue.h('span') },
    '@/Components/Moderation/NodeLink.vue': { default: Link },
    '@/Components/Moderation/ModerationListing.vue': {
        default: {
            props: ['listing'],
            setup:
                (props, { slots }) =>
                () =>
                    Vue.h('table', [
                        Vue.h('tbody', [
                            Vue.h('tr', slots.row({ row })),
                            props.listing.expanded
                                ? Vue.h('tr', [
                                      Vue.h('td', [
                                          slots['detail-top']({ row }),
                                          slots.detail({ row }),
                                      ]),
                                  ])
                                : null,
                        ]),
                    ]),
        },
    },
});

async function render(expanded, view = 'flagged') {
    const app = Vue.createSSRApp(NodeListing, {
        columns: [],
        listing: {
            view,
            state: {},
            expanded: expanded ? `${view}:200` : null,
            dismissingFlag: null,
            details: { [`${view}:200`]: { reports } },
            loadDetails() {},
            query: () => '/moderation/changesets',
            osm: (path) => path,
            rowKey: (row) => `${view}:${row.id}`,
            expand() {},
            dismissFlag() {},
            absoluteTime: (value) => value,
        },
    });
    app.provide('route', () => '/moderation/rules/5/edit');
    return renderToString(app);
}

test('collapsed mixed-source rows show what, frequency and distinct event times without hidden evidence or dismiss actions', async () => {
    const html = await render(false);
    assert.match(html, /not-there.*?2/s);
    assert.match(html, /Require mount/);
    assert.match(html, /divide-y divide-daf-border/);
    assert.doesNotMatch(
        html,
        /Missing tags: mount|rule match|Unverified user report|expand for evidence/,
    );
    assert.match(html, /Last reported.*?datetime="2026-09-21T22:05:20Z"/s);
    assert.match(html, /Last checked.*?datetime="2026-09-21T22:00:00Z"/s);
    assert.doesNotMatch(html, /<details|Dismiss|Reports &amp; rule violations/);
    assert.match(
        html,
        /aria-expanded="false".*?aria-controls="node-details-200"/s,
    );
});

test('one expanded row contains readable evidence, exact dates, severity and per-source review actions', async () => {
    for (const view of ['flagged', 'nodes']) {
        const html = await render(true, view);
        const details = html.slice(html.indexOf('<section'));
        assert.match(details, /aria-label="Individual rule violations"/);
        assert.match(details, /aria-label="Individual not-there reports"/);
        assert.match(details, /#10/);
        assert.match(details, /#11/);
        assert.match(details, /2026-09-21T21:34:30Z/);
        assert.match(details, /2026-09-21T22:05:20Z/);
        assert.match(details, /Android Auto/);
        assert.doesNotMatch(
            details,
            /Reporter|Unverified app identity|Authenticated account|98765/,
        );
        assert.match(details, /CarPlay/);
        assert.match(details, /Missing tags: mount/);
        assert.match(details, /First flagged.*?2026-09-20T00:00:00Z/s);
        assert.doesNotMatch(details, /Repeat occurrences/);
        assert.match(details, /High/);
        assert.match(details, /Stale evidence/);
        assert.match(
            details,
            /aria-label="Dismiss Driver reported missing for node 200"/,
        );
        assert.doesNotMatch(
            details,
            /aria-label="Dismiss Require mount for node 200"/,
        );
    }
});

test('dismissed reports retain their count and review date without a dismiss action or invented severity', async () => {
    const app = Vue.createSSRApp(FlagDetails, {
        flags: [
            {
                ...row.flags[0],
                status: 'dismissed',
                dismissed_at: '2026-09-21T23:00:00Z',
            },
        ],
        reports,
        nodeId: 200,
        absoluteTime: (value) => value,
    });
    app.provide('route', () => '/moderation/rules/5/edit');
    const html = await renderToString(app);
    assert.match(html, /Not there reports · 2/);
    assert.match(html, /Dismissed.*?2026-09-21T23:00:00Z/s);
    assert.doesNotMatch(html, /<button|High|rules\/5/);
});

test('dismiss actions emit the selected flag and disable during a pending review', () => {
    const elements = [];
    const renderer = Vue.createRenderer({
        createElement(tag) {
            const node = { tag, props: {} };
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
        patchProp(node, key, _previous, value) {
            node.props[key] = value;
        },
    });
    for (const flag of row.flags.filter(
        (flag) => flag.source === 'alpr_presence',
    )) {
        let dismissed;
        const app = renderer.createApp(FlagDetails, {
            flags: [flag],
            nodeId: 200,
            absoluteTime: (value) => value,
            onDismiss: (value) => {
                dismissed = value;
            },
        });
        app.provide('route', () => '/moderation/rules/5/edit');
        app.mount({});
        const button = elements.findLast(
            (node) =>
                node.tag === 'button' &&
                node.props['aria-label']?.startsWith('Dismiss'),
        );
        assert.equal(button.props.disabled, false);
        button.props.onClick();
        assert.equal(dismissed, flag);
        app.unmount();
    }
    const app = renderer.createApp(FlagDetails, {
        flags: [row.flags[0]],
        nodeId: 200,
        absoluteTime: (value) => value,
        dismissing: true,
    });
    app.provide('route', () => '/moderation/rules/5/edit');
    app.mount({});
    assert.equal(
        elements.findLast(
            (node) =>
                node.tag === 'button' &&
                node.props['aria-label']?.startsWith('Dismiss'),
        ).props.disabled,
        true,
    );
    app.unmount();
});

test('switching report and rule sources updates the date column heading and sort key', async () => {
    const renderedColumns = [];
    const Flagged = await component('../../Pages/Moderation/Flagged', {
        '@/useModerationListing': {
            moderationListingProps: { filters: Object },
            useModerationListing: () => ({}),
        },
        '@/Components/Moderation/NodeListing.vue': {
            default: {
                props: ['columns'],
                setup: (props) => () => {
                    renderedColumns.push(props.columns);
                    return Vue.h('div');
                },
            },
        },
    });
    const props = Vue.reactive({ filters: { flag_source: 'alpr_presence' } });
    const renderer = Vue.createRenderer({
        createElement: () => ({}),
        createText: () => ({}),
        createComment: () => ({}),
        insert() {},
        remove() {},
        setText() {},
        setElementText() {},
        patchProp() {},
        parentNode: () => null,
        nextSibling: () => null,
    });
    const app = renderer.createApp({
        setup: () => () => Vue.h(Flagged, props),
    });
    app.mount({});
    assert.ok(
        renderedColumns
            .at(-1)
            .some(
                ([key, label]) =>
                    key === 'reported_at' && label === 'Report received',
            ),
    );
    props.filters = { flag_source: 'rule' };
    await Vue.nextTick();
    assert.ok(
        renderedColumns
            .at(-1)
            .some(
                ([key, label]) =>
                    key === 'changed_at' && label === 'Node updated',
            ),
    );
    assert.ok(
        !renderedColumns
            .at(-1)
            .some(([, label]) => label === 'Report received'),
    );
    app.unmount();
});

test('duplicate evidence links to the other node profile from either endpoint even without coordinates', async () => {
    for (const [nodeId, otherId] of [
        [200, 300],
        [300, 200],
    ]) {
        const app = Vue.createSSRApp(FlagDetails, {
            flags: [
                {
                    id: 10,
                    node_id: 200,
                    related_node_id: 300,
                    source: 'rule',
                    status: 'open',
                    evidence: { distance_meters: 8.2, radius_meters: 25 },
                },
            ],
            nodeId,
            absoluteTime: (value) => value,
        });
        app.provide('route', (name, id) =>
            name === 'moderation.nodes.show'
                ? `/moderation/nodes/${id}`
                : '/moderation/rules/5/edit',
        );
        const html = (await renderToString(app)).replace(/<!--.*?-->/g, '');
        assert.match(
            html,
            new RegExp(
                `<a[^>]*href="/moderation/nodes/${otherId}"[^>]*>${nodeId === 200 ? 'Original primary node' : 'Duplicate node'} ${otherId} is 8.2 m away \\(within 25 m\\)</a>`,
            ),
        );
        assert.doesNotMatch(
            html,
            new RegExp(`href="/moderation/nodes/${nodeId}"`),
        );
    }
});

test('node profiles and expanded node queues pass both duplicate endpoints to the map', async () => {
    const maps = [];
    const Wrapper = {
        setup:
            (_, { slots }) =>
            () =>
                Vue.h('div', slots.default?.()),
    };
    const Empty = () => Vue.h('div');
    const MapPreview = {
        props: ['nodes'],
        setup: (props) => () => {
            maps.push(props.nodes);
            return Vue.h('div');
        },
    };
    const dependencies = {
        '@/Components/Moderation/ModerationMap.vue': { default: MapPreview },
        '@/Layouts/ModerationLayout.vue': { default: Wrapper },
        '@/Components/Moderation/NodeLink.vue': { default: NodeLink },
        '@/Components/Moderation/FlagLabel.vue': { default: FlagLabel },
        '@/Components/Moderation/FlagDetails.vue': { default: FlagDetails },
        '@/Components/Moderation/AreaDialog.vue': { default: Empty },
        '@/Components/Moderation/ModerationPageHeader.vue': { default: Empty },
        '@/Components/Daf/DafButton.vue': { default: Empty },
        '@/useModerationTime': {
            useModerationTime: () => ({
                absoluteTime: (value) => value,
                localDate: (value) => value,
            }),
        },
        '@/moderation': moderation,
        '@/moderationFlags': flags,
        '@inertiajs/vue3': {
            Link,
            Head: Empty,
            router: {},
            usePage: () => ({ props: {} }),
        },
        '@headlessui/vue': {
            Combobox: Wrapper,
            ComboboxInput: Empty,
            ComboboxOption: Wrapper,
            ComboboxOptions: Wrapper,
        },
    };
    const Node = await component('../../Pages/Moderation/Node', dependencies);
    const Listing = await component('ModerationListing', dependencies);
    const duplicate = {
        id: 10,
        node_id: 200,
        related_node_id: 300,
        source: 'rule',
        status: 'open',
        evidence: {
            radius_meters: 25,
            locations: { 200: [-97.74, 30.27], 300: [-97.7401, 30.2701] },
        },
    };
    for (const id of [200, 300]) {
        const [longitude, latitude] = duplicate.evidence.locations[id];
        const node = { ...row, id, longitude, latitude, flags: [duplicate] };
        const profile = Vue.createSSRApp(Node, {
            node,
            versions: [],
            flags: [duplicate],
            source: { state: 'ready' },
            counts: {},
            osmUrl: 'https://www.openstreetmap.org',
        });
        profile.provide('route', () => '/moderation/nodes');
        await renderToString(profile);
        assert.deepEqual(
            maps.at(-1).map((node) => node.id),
            [id, id === 200 ? 300 : 200],
        );
        for (const view of ['nodes', 'flagged']) {
            const key = `${view}:${id}`;
            const listing = Vue.createSSRApp(Listing, {
                columns: [],
                listing: {
                    view,
                    title: 'Nodes',
                    isNodes: true,
                    isChangesets: false,
                    groups: [],
                    state: {},
                    matchingAreas: [],
                    ruleOptions: [],
                    expanded: key,
                    details: { [key]: {} },
                    detailErrors: {},
                    detailLoading: {},
                    selectedNodes: {},
                    rowKey: (row) => `${view}:${row.id}`,
                    records: { data: [node] },
                    counts: {},
                    source: { state: 'ready' },
                    page: { props: {} },
                },
            });
            await renderToString(listing);
            assert.deepEqual(
                maps.at(-1).map((node) => node.id),
                [id, id === 200 ? 300 : 200],
            );
        }
    }
});
