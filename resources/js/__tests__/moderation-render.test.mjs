import { createInertiaApp } from '@inertiajs/vue3';
import { renderToString } from '@vue/server-renderer';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL, URL, URLSearchParams } from 'node:url';
import { createSSRApp, h } from 'vue';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const assets = resolve(root, 'bootstrap/ssr/assets');
const files = await readdir(assets);
const components = {
    'Auth/Login': await import(
        pathToFileURL(
            resolve(
                assets,
                files.find((file) => /^Login-.*\.js$/.test(file)),
            ),
        )
    ),
    'Moderation/Index': await import(
        pathToFileURL(
            resolve(
                assets,
                files.find((file) => /^Index-.*\.js$/.test(file)),
            ),
        )
    ),
};
for (const name of ['Node', 'Rules', 'RuleForm']) {
    components[`Moderation/${name}`] = await import(
        pathToFileURL(
            resolve(
                assets,
                files.find(
                    (file) =>
                        file.startsWith(`${name}-`) && file.endsWith('.js'),
                ),
            ),
        )
    );
}
const base = {
    auth: { user: { id: 1, name: 'Maya Ortiz', osm_uid: 123 } },
    errors: {},
    view: 'nodes',
    filters: {},
    records: { data: [], total: 0, last_page: 1, current_page: 1 },
    profile: null,
    weeks: [],
    areas: [],
    counts: { nodes: 1, areas: 0 },
    source: { state: 'ready', observed_at: '2026-09-01T12:00:00Z' },
    osmUrl: 'https://www.openstreetmap.org',
};
function route(name, args = {}) {
    if (name === 'moderation.nodes.show' && typeof args === 'object')
        return `/moderation/nodes/show/${args.node}?from=${args.from}`;
    if (name === 'logout') return '/logout';
    if (name === 'login.osm') return '/login/openstreetmap';
    if (name === 'moderation.index')
        return `/moderation?${new URLSearchParams(args)}`;
    return `/moderation/${name.split('.').slice(1).join('/')}/${typeof args === 'number' ? args : ''}`;
}
async function render(component, props) {
    return createInertiaApp({
        page: { component, props, url: '/moderation', version: 'test' },
        resolve: (name) => components[name],
        render: renderToString,
        setup({ App, props, plugin }) {
            const app = createSSRApp({ render: () => h(App, props) });
            app.use(plugin);
            app.provide('route', route);
            app.config.globalProperties.route = route;
            return app;
        },
    });
}
async function preview(name, output, theme = 'light') {
    if (!process.env.MODERATION_PREVIEW_DIR) return;
    await mkdir(process.env.MODERATION_PREVIEW_DIR, { recursive: true });
    const manifest = JSON.parse(
        await readFile(resolve(root, 'public/build/manifest.json'), 'utf8'),
    );
    const css = [
        ...new Set(Object.values(manifest).flatMap((entry) => entry.css || [])),
    ];
    const body = output.body.replaceAll(
        'src="/build/',
        `src="${pathToFileURL(resolve(root, 'public/build')).href}/`,
    );
    await writeFile(
        resolve(process.env.MODERATION_PREVIEW_DIR, `${name}-${theme}.html`),
        `<!doctype html><html data-theme="${theme}" class="${theme === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${output.head.join('')}${css.map((file) => `<link rel="stylesheet" href="${pathToFileURL(resolve(root, 'public/build', file)).href}">`).join('')}</head><body>${body}</body></html>`,
    );
}
test('compiled login preserves the supplied design copy and all failure states', async () => {
    for (const [state, expected] of [
        ['idle', 'Continue with OpenStreetMap'],
        ['denied', 'Sign-in cancelled.'],
        ['error', 'OpenStreetMap didn&#39;t respond.'],
        ['unapproved', 'This account isn&#39;t approved.'],
    ]) {
        const output = await render('Auth/Login', {
            ...base,
            auth: { user: null },
            loginState: state,
        });
        assert.ok(output.body.includes(expected));
        assert.ok(output.body.includes('max-w-[400px]'));
        assert.ok(!output.body.includes('type="password"'));
        await preview(`login-${state}`, output);
        if (state === 'idle') await preview('login-idle', output, 'dark');
    }
});
test('compiled moderation renders source-backed rows and escapes upstream text', async () => {
    const nodes = Array.from({ length: 8 }, (_, index) => ({
        id: 12034559102 + index,
        osm_uid: 123,
        osm_user: 'mapper_atx',
        osm_version: 3,
        osm_changeset_id: 164178204,
        changed_at: '2026-09-01T12:00:00Z',
        direction: index % 2 ? 270 : null,
        operator: index % 2 ? 'Flock Safety' : null,
        tags: {},
        latitude: 30.27,
        longitude: -97.74,
    }));
    const output = await render('Moderation/Index', {
        ...base,
        records: { ...base.records, data: nodes, total: nodes.length },
    });
    assert.ok(!output.body.includes('Dismiss'));
    assert.ok(!output.body.includes('Severity'));
    assert.ok(!output.body.includes('Missing direction'));
    assert.ok(!output.body.includes('Moved &gt;50'));
    assert.ok(output.body.includes('Changeset'));
    assert.ok(output.body.includes('aria-label="OSM node ID"'));
    assert.ok(output.body.includes('placeholder="#  OSM node ID"'));
    assert.ok(output.body.includes('12034559102'));
    assert.ok(
        output.body.includes('/moderation/nodes/show/12034559102'),
        'node ID links to the dedicated profile',
    );
    assert.ok(output.body.includes('270°'));
    await preview('nodes', output);
    await preview('nodes', output, 'dark');
    const changes = await render('Moderation/Index', {
        ...base,
        view: 'changesets',
        records: {
            ...base.records,
            total: 1,
            data: [
                {
                    id: 164178204,
                    osm_uid: 123,
                    osm_user: 'mapper_atx',
                    comment: '<script>alert(1)</script>',
                    changed_at: '2026-09-01T12:00:00Z',
                    added: 2,
                    modified: 1,
                    deleted: 0,
                    total: 3,
                    tags: {},
                    bounds: [-98, 30, -97, 31],
                    status: 'Needs review',
                },
            ],
        },
    });
    assert.ok(changes.body.includes('&lt;script&gt;'));
    assert.ok(!changes.body.includes('<script>alert(1)</script>'));
    assert.ok(!changes.body.includes('aria-label="OSM node ID"'));
    const changesetTableHead = changes.body.match(
        /<table[^>]*mod-table-changesets[^>]*>.*?<thead>(.*?)<\/thead>/s,
    )?.[1];
    assert.ok(changesetTableHead);
    assert.doesNotMatch(changesetTableHead, />Status</);
    await preview('changesets', changes);
});

test('compiled ALPR node profile renders history, tags, editors, and honest flag state', async () => {
    const versions = [
        {
            id: 1,
            node_id: 200,
            osm_version: 1,
            visible: true,
            latitude: 30.5,
            longitude: -97.5,
            tags: { 'surveillance:type': 'ALPR' },
            osm_uid: 123,
            osm_user: 'mapper_atx',
            osm_updated_at: '2026-09-01T12:00:00Z',
            changeset_id: 100,
            comment: 'Added surveyed camera',
        },
    ];
    const output = await render('Moderation/Node', {
        ...base,
        node: {
            id: 200,
            osm_version: 1,
            osm_changeset_id: 100,
            osm_uid: 123,
            osm_user: 'mapper_atx',
            visible: true,
            latitude: 30.5,
            longitude: -97.5,
            direction: null,
            operator: null,
            changed_at: '2026-09-01T12:00:00Z',
        },
        versions,
        flags: [],
    });

    assert.ok(output.body.includes('Node'));
    assert.ok(output.body.includes('200'));
    assert.ok(output.body.includes('No open flags'));
    assert.ok(output.body.includes('History'));
    assert.ok(output.body.includes('Tags'));
    assert.ok(output.body.includes('Who touched it'));
    assert.ok(output.body.includes('Added surveyed camera'));
    assert.ok(output.body.includes('(missing)'));
});
test('unavailable source shows recovery state without claiming an empty review queue', async () => {
    const output = await render('Moderation/Index', {
        ...base,
        source: { state: 'unavailable' },
    });
    assert.ok(output.body.includes('Waiting for OpenStreetMap data'));
    assert.ok(output.body.includes('Try again'));
    await preview('unavailable', output);
});

test('pagination renders next and previous links without aggregate totals', async () => {
    const output = await render('Moderation/Index', {
        ...base,
        records: {
            data: [],
            current_page: 2,
            from: 201,
            to: 400,
            prev_page_url: '/moderation?page=1',
            next_page_url: '/moderation?page=3',
        },
    });
    assert.ok(output.body.includes('Showing 201–400'));
    assert.ok(output.body.includes('Page 2'));
    assert.ok(output.body.includes('/moderation?page=1'));
    assert.ok(output.body.includes('/moderation?page=3'));
    assert.ok(!output.body.includes('undefined'));
});

test('editor profile follows the design timeline and shows missing outcomes as unavailable', async () => {
    const profile = {
        osm_uid: 123,
        name: 'mapper_atx',
        first_active: '2026-06-01T12:00:00Z',
        last_active: '2026-09-01T12:00:00Z',
        tracked_changesets: 3,
        added: 18,
        modified: 4,
        deleted: 2,
        flagged_changesets: 1,
        flags_count: null,
        status: null,
    };
    const records = {
        data: Array.from({ length: 3 }, (_, index) => ({
            id: 164178204 + index,
            added: 6,
            modified: index,
            deleted: index,
            comment: index
                ? 'Survey: camera locations along the Austin corridor'
                : '<script>alert(1)</script>',
            changed_at: '2026-09-01T12:00:00Z',
            status: index ? 'Needs review' : 'Flagged',
            bounds: [-98, 30, -97, 31],
        })),
        from: 1,
        to: 3,
        next_page_url: '/moderation?view=profile&uid=123&page=2',
    };
    const output = await render('Moderation/Index', {
        ...base,
        view: 'profile',
        filters: { uid: 123 },
        profile,
        records,
        weeks: Array.from({ length: 12 }, (_, index) => ({
            week: new Date(Date.UTC(2026, 5, 22 + index * 7)).toISOString(),
            total: index % 4,
        })),
    });
    for (const label of [
        'Timeline',
        'Edit survival',
        'Activity',
        'Where they map',
        'Median time to revert',
        'Most reverted by',
        'Last revert',
        'Affected nodes',
        'Reverts performed',
        'Edited by others',
        'Unavailable',
        'Unknown',
    ]) {
        assert.ok(output.body.includes(label), label);
    }
    assert.ok(!output.body.includes('<table'));
    assert.ok(!output.body.includes('100%'));
    assert.ok(!output.body.includes('Flagged nodes'));
    for (const record of records.data) {
        assert.ok(
            output.body.includes(`Details for changeset ${record.id}`),
            `timeline disclosure for changeset ${record.id}`,
        );
    }
    assert.ok(!output.body.includes('Watch means'));
    assert.ok(!output.body.includes('<script>alert(1)</script>'));
    assert.ok(output.body.includes('&lt;script&gt;'));
    assert.ok(output.body.includes('outcome=reverted'));
    assert.ok(output.body.includes('Timeline pagination'));
    assert.ok(
        output.body.includes('view=profile&amp;uid=123&amp;statuses=Flagged'),
    );
    await preview('profile', output);
    await preview('profile', output, 'dark');
    const editors = await render('Moderation/Index', {
        ...base,
        view: 'editors',
        records: { data: [profile] },
    });
    for (const label of ['Survival', 'Areas', 'Last active', 'Profile'])
        assert.ok(editors.body.includes(label));
    assert.ok(!editors.body.includes('Watch means'));
    await preview('editors', editors);
});

test('areas retain their design and distinguish missing rule counts from zero', async () => {
    const output = await render('Moderation/Index', {
        ...base,
        view: 'areas',
        records: {
            data: [
                {
                    id: 1,
                    name: 'Austin metro',
                    kind: 'bbox',
                    definition: '30, -98 → 31, -97',
                    watchers: [],
                    open_flags: null,
                    changesets_7d: 12,
                    flagged_changesets: 0,
                    created_at: '2026-09-01T12:00:00Z',
                },
            ],
        },
    });
    assert.ok(output.body.includes('Austin metro'));
    assert.ok(output.body.includes('Subscribe'));
    assert.ok(output.body.includes('12'));
    assert.ok(output.body.includes('—'));
    await preview('areas', output);
});

test('Rules screens render typed settings and stored outcomes populate profile panels', async () => {
    const rules = await render('Moderation/Rules', {
        ...base,
        rules: [],
        processes: [],
    });
    assert.ok(rules.body.includes('Create rule'));
    const form = await render('Moderation/RuleForm', {
        ...base,
        rule: null,
        versions: [],
    });
    assert.ok(form.body.includes('Required tags'));
    assert.ok(form.body.includes('Preview rule'));
    const editor = await render('Moderation/Index', {
        ...base,
        view: 'profile',
        profile: {
            osm_uid: 123,
            name: 'mapper',
            tracked_changesets: 2,
            added: 2,
            modified: 0,
            deleted: 0,
            survival: {
                intact: 1,
                edited: 0,
                reverted: 1,
                unknown: 0,
                percent: 50,
            },
            revert_stats: { affected_nodes: 1, performed: 0 },
            mapping_areas: [{ id: 1, name: 'Austin', count: 2 }],
            calculated_at: '2026-09-07T00:00:00Z',
        },
    });
    assert.ok(editor.body.includes('50%'));
    assert.ok(editor.body.includes('Austin'));
    assert.ok(editor.body.includes('Calculated'));
});

test('summary refresh does not claim an OSM outage or empty editor results', async () => {
    const output = await render('Moderation/Index', {
        ...base,
        view: 'editors',
        source: { state: 'refreshing' },
    });
    assert.match(output.body, /Summaries are still being calculated/);
    assert.match(output.body, /Waiting for summaries/);
    assert.doesNotMatch(
        output.body,
        /OpenStreetMap data is unavailable|No editors match/,
    );
});

test('summary refresh shows persisted rows and queue progress', async () => {
    const output = await render('Moderation/Index', {
        ...base,
        view: 'editors',
        records: {
            ...base.records,
            data: [
                {
                    id: 123,
                    osm_uid: 123,
                    name: 'Cached mapper',
                    tracked_changesets: 5,
                    added: 2,
                    modified: 1,
                    deleted: 0,
                    flags_count: null,
                    survival: { percent: null, reverted: null },
                    area_count: 0,
                    last_active: '2026-09-01T12:00:00Z',
                },
            ],
        },
        source: {
            state: 'refreshing',
            calculated_at: '2026-09-10T07:16:45Z',
            summary_progress: { completed: 3, total: 10, failed: 0 },
        },
    });
    assert.match(output.body, /Cached mapper/);
    assert.match(output.body, /Refreshing 3\/10 summaries/);
    assert.doesNotMatch(output.body, /Last calculated|CDT/);
});

test('summary refresh failures keep stale rows visible with an explicit status', async () => {
    const output = await render('Moderation/Index', {
        ...base,
        view: 'editors',
        records: {
            ...base.records,
            data: [
                {
                    id: 123,
                    osm_uid: 123,
                    name: 'Stale mapper',
                    survival: {},
                },
            ],
        },
        source: {
            state: 'refreshing',
            summary_progress: { completed: 9, total: 10, failed: 1 },
        },
    });
    assert.match(output.body, /1 summary job failed/);
    assert.match(output.body, /Stale calculated rows remain visible/);
    assert.match(output.body, /Stale mapper/);
});

test('flagged table renders rule evidence and its own filters while ALPR keeps its columns', async () => {
    const row = {
        id: 200,
        osm_uid: 123,
        osm_user: 'mapper',
        osm_version: 2,
        osm_changeset_id: 100,
        changed_at: '2026-09-01T12:00:00Z',
        direction: 90,
        operator: 'City',
        tags: {},
        flags: [
            {
                id: 1,
                rule_id: 5,
                evidence_hash: 'abc',
                stale: true,
                evidence: {},
                rule: { name: 'Require mount', severity: 'High' },
            },
        ],
    };
    for (const view of ['nodes', 'flagged']) {
        const output = await render('Moderation/Index', {
            ...base,
            view,
            filters: { rules: ['5'], severities: ['High'], area: '1' },
            areas: [{ id: 1, name: 'Austin' }],
            ruleOptions: [{ id: 5, name: 'Require mount' }],
            records: { ...base.records, data: [row] },
        });
        const header = output.body.match(/<thead>(.*?)<\/thead>/s)[1];
        assert.equal(header.includes('Severity'), view === 'flagged');
        assert.ok(output.body.includes('view=flagged'));
        assert.ok(output.body.includes('aria-label="Remove location Austin"'));
        assert.ok(output.body.includes('placeholder="Search locations…"'));
        assert.ok(output.body.includes('aria-label="OSM node ID"'));
        assert.ok(
            output.body.indexOf('aria-label="Direction from"') <
                output.body.indexOf('aria-label="Watched area"'),
        );
        assert.ok(
            output.body.indexOf('aria-label="Operator"') <
                output.body.indexOf('aria-label="Changeset ID"'),
        );
        if (view === 'flagged') {
            assert.ok(
                output.body.includes('/moderation/nodes/show/200?from=flagged'),
            );
            assert.ok(output.body.includes('Require mount · Stale'));
            assert.ok(output.body.includes('1 flagged nodes on this page'));
            assert.ok(
                output.body.includes(
                    'aria-label="Dismiss Require mount for node 200"',
                ),
            );
        }
        await preview(view + '-flags', output);
        await preview(view + '-flags', output, 'dark');
    }
});

test('empty tables distinguish all ALPR nodes from the flagged queue', async () => {
    for (const [view, label] of [
        ['nodes', 'No ALPR nodes match'],
        ['flagged', 'No flagged nodes match'],
    ]) {
        const output = await render('Moderation/Index', { ...base, view });
        assert.ok(output.body.includes(label));
        if (view === 'flagged')
            assert.ok(output.body.includes('No active rules'));
    }
});
