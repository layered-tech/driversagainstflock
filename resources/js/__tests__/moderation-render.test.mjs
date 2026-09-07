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
    assert.ok(output.body.includes('12034559102'));
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
    await preview('changesets', changes);
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
        'Nodes in reverted sets',
        'Reverts performed',
        'Edited by others',
        'Not yet tracked',
        'Not yet configured',
    ]) {
        assert.ok(output.body.includes(label), label);
    }
    assert.ok(!output.body.includes('<table'));
    assert.ok(!output.body.includes('100%'));
    assert.ok(!output.body.includes('Flagged nodes'));
    assert.ok(!output.body.includes('Watch means'));
    assert.ok(!output.body.includes('<script>alert(1)</script>'));
    assert.ok(output.body.includes('&lt;script&gt;'));
    assert.ok(output.body.includes('aria-disabled="true"'));
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
