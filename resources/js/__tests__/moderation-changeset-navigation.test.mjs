import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createRenderer, h, nextTick, reactive } from 'vue';
import { useModerationListing } from '../useModerationListing.js';

const renderer = createRenderer({
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

test('changeset links expand and load the filtered row on arrival and subsequent navigation', async (t) => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
        requests.push(url);
        return { ok: true, json: async () => ({ versions: { data: [] } }) };
    });
    const props = reactive({
        filters: { changeset: '123' },
        records: { data: [{ id: 123 }] },
        areas: [],
    });
    let listing;
    const app = renderer.createApp({
        setup() {
            listing = useModerationListing(props, 'changesets');
            return () => h('div');
        },
    });
    app.provide('route', (name, id) => `${name}/${id}`);
    app.mount({});
    t.after(() => app.unmount());
    await nextTick();
    assert.equal(listing.expanded.value, 'changesets:123');
    assert.deepEqual(requests, ['moderation.changesets.show/123']);

    listing.expand(props.records.data[0]);
    assert.equal(listing.expanded.value, null);

    props.filters = { changeset: '456' };
    props.records = { data: [{ id: 456 }] };
    await nextTick();
    assert.equal(listing.expanded.value, 'changesets:456');
    assert.equal(requests.at(-1), 'moderation.changesets.show/456');

    props.filters = {};
    await nextTick();
    assert.equal(listing.expanded.value, null);

    props.filters = { changeset: '999' };
    props.records = { data: [] };
    await nextTick();
    assert.equal(listing.expanded.value, null);
    assert.equal(requests.length, 2);
});

for (const view of ['nodes', 'flagged']) {
    test(`${view} expansion fetches individual reports and paginates within the detail row`, async (t) => {
        const requests = [];
        t.mock.method(globalThis, 'fetch', async (url) => {
            requests.push(url);
            return {
                ok: true,
                json: async () => ({
                    reports: { data: [{ id: requests.length }], total: 26 },
                }),
            };
        });
        const row = { id: 123 };
        let listing;
        const app = renderer.createApp({
            setup() {
                listing = useModerationListing(
                    reactive({
                        filters: {},
                        records: { data: [row] },
                        areas: [],
                    }),
                    view,
                );
                return () => h('div');
            },
        });
        app.provide('route', (name, id) => `${name}/${id}`);
        app.mount({});
        t.after(() => app.unmount());
        listing.expand(row);
        await setImmediate();
        assert.deepEqual(requests, ['moderation.nodes.show/123']);
        assert.equal(listing.details[`${view}:123`].reports.data[0].id, 1);
        await listing.loadDetails(
            row,
            'moderation.nodes.show/123?reports_page=2',
        );
        assert.equal(
            requests.at(-1),
            'moderation.nodes.show/123?reports_page=2',
        );
        assert.equal(listing.details[`${view}:123`].reports.data[0].id, 2);
        assert.equal(listing.expanded.value, `${view}:123`);
        listing.expand(row);
        listing.expand(row);
        assert.equal(requests.length, 2);
    });
}
