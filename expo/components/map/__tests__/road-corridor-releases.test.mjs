import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    corridorCacheDeletions,
    createCorridorReleaseManager,
    validateCorridorCatalog,
} from '../road-corridor-releases.js';

const bundled = {
    schema_version: 1,
    ...JSON.parse(
        readFileSync(
            new URL(
                '../../../assets/map/wisconsin-corridor.json',
                import.meta.url,
            ),
        ),
    ),
};
const options = {
    location: { latitude: 43.12152, longitude: -88.24447 },
    radiusMeters: 3200,
};
function harness(overrides = {}) {
    let saved,
        prepared = [],
        control = {
            enabled: true,
            catalog: { ...bundled, release: 'new-release' },
        },
        now = 100000;
    const manager = createCorridorReleaseManager({
        bundled,
        read: async () => saved,
        write: async (value) => {
            saved = value;
        },
        fetchControl: async () => control,
        prepare: async (catalog) => {
            prepared.push(catalog.release);
        },
        now: () => now,
        ...overrides,
    });
    return {
        manager,
        saved: () => saved,
        prepared,
        control: (value) => {
            control = value;
            now += 60001;
        },
    };
}
test('promotes only after replacement validation and retains the previous release across restart', async () => {
    let finish;
    const h = harness({
        prepare: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    const updating = h.manager.refresh(options);
    await new Promise(setImmediate);
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.equal(h.saved(), undefined);
    finish();
    await updating;
    assert.equal(h.manager.getState().active.release, 'new-release');
    assert.equal(h.saved().previous.release, bundled.release);
    const restarted = harness({ read: async () => h.saved() });
    await restarted.manager.ready();
    assert.equal(restarted.manager.getSnapshot().release, 'new-release');
});
test('failed downloads, unsupported schemas, and failed persistence retain the working release', async () => {
    for (const overrides of [
        {
            prepare: async () => {
                throw Error('bad tile');
            },
        },
        {
            write: async () => {
                throw Error('disk full');
            },
        },
        {
            fetchControl: async () => ({
                enabled: true,
                catalog: { ...bundled, schema_version: 2 },
            }),
        },
    ]) {
        const h = harness(overrides);
        await h.manager.refresh(options);
        assert.equal(h.manager.getState().active.release, bundled.release);
        assert.ok(h.manager.getSnapshot().error);
    }
});
test('server disable and persisted local rollback bypass candidate downloads', async () => {
    const h = harness();
    await h.manager.setForceService(true);
    await h.manager.refresh(options);
    assert.deepEqual(h.prepared, []);
    assert.equal(h.saved().forceService, true);
    h.control({ enabled: false });
    await h.manager.refresh(options);
    assert.equal(h.manager.getState().enabled, false);
    assert.deepEqual(h.prepared, []);
    const restarted = harness({ read: async () => h.saved() });
    await restarted.manager.ready();
    assert.equal(restarted.manager.getState().forceService, true);
    assert.equal(restarted.manager.getState().enabled, false);
});
test('rollback selected during candidate validation wins over promotion', async () => {
    let finish;
    const h = harness({
        prepare: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    const update = h.manager.refresh(options);
    await new Promise(setImmediate);
    await h.manager.setForceService(true);
    finish();
    await update;
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.equal(h.manager.getState().forceService, true);
});
test('offline manifest failures do not discard an existing persisted release or hammer discovery', async () => {
    let calls = 0;
    const h = harness({
        fetchControl: async () => {
            calls++;
            throw Error('offline');
        },
    });
    await h.manager.refresh(options);
    await h.manager.refresh(options);
    assert.equal(calls, 1);
    assert.equal(h.manager.getState().active.release, bundled.release);
});
test('catalog validation rejects duplicate tiles, path traversal, and malformed coverage', () => {
    assert.equal(validateCorridorCatalog(bundled), bundled);
    for (const change of [
        { release: '../other' },
        { coverage: [[]] },
        { tiles: [bundled.tiles[0], bundled.tiles[0]] },
        { tiles: [{ ...bundled.tiles[0], key: 'other/file.gz' }] },
    ])
        assert.throws(() => validateCorridorCatalog({ ...bundled, ...change }));
});
test('cleanup removes abandoned releases and partials before oldest tiles, preserving active work and rollback coverage', () => {
    const entries = [
        { path: 'old', release: 'obsolete', size: 20, modifiedAt: 0 },
        {
            path: 'partial',
            release: 'new',
            size: 20,
            modifiedAt: 0,
            partial: true,
        },
        {
            path: 'inflight',
            release: 'candidate',
            size: 20,
            modifiedAt: 0,
            partial: true,
        },
        { path: 'active', release: 'new', size: 30, modifiedAt: 3 },
        { path: 'rollback', release: 'previous', size: 30, modifiedAt: 1 },
        { path: 'least-recent', release: 'new', size: 40, modifiedAt: 0 },
    ];
    assert.deepEqual(
        corridorCacheDeletions(entries, {
            retainedReleases: new Set(['new', 'previous']),
            protectedPaths: new Set(['active', 'rollback', 'inflight']),
            maximumBytes: 80,
        }),
        ['old', 'partial', 'least-recent'],
    );
});

test('server rollback remains effective even when persistence fails', async () => {
    const h = harness({
        write: async () => {
            throw Error('disk full');
        },
        fetchControl: async () => ({ enabled: false }),
    });
    await h.manager.refresh(options);
    assert.equal(h.manager.getState().enabled, false);
    assert.ok(h.manager.getRevision() > 0);
});

test('local rollback during pointer persistence restores the old release pointer', async () => {
    let finish,
        saved,
        writes = 0;
    const h = harness({
        write: async (value) => {
            if (++writes === 1)
                await new Promise((resolve) => {
                    finish = resolve;
                });
            saved = value;
        },
    });
    const updating = h.manager.refresh(options);
    await new Promise(setImmediate);
    const rollback = h.manager.setForceService(true);
    await new Promise(setImmediate);
    finish();
    await Promise.all([updating, rollback]);
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.equal(saved.active.release, bundled.release);
    assert.equal(saved.forceService, true);
});

test('corrupt active metadata restores the previous release without losing the rollback preference', async () => {
    const h = harness({
        read: async () => ({
            active: { schema_version: 99 },
            previous: bundled,
            forceService: true,
            enabled: false,
        }),
    });
    await h.manager.ready();
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.equal(h.manager.getState().forceService, true);
    assert.equal(h.manager.getState().enabled, false);
    assert.ok(h.manager.getSnapshot().error);
});

test('a candidate with missing neighboring coverage never reaches promotion', async () => {
    const h = harness({
        fetchControl: async () => ({
            enabled: true,
            catalog: {
                ...bundled,
                release: 'incomplete',
                tiles: [bundled.tiles[0]],
            },
        }),
    });
    await h.manager.refresh(options);
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.deepEqual(h.prepared, []);
});

test('moving into unprepared tiles during an update keeps the current release', async () => {
    let finish;
    const h = harness({
        prepare: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    const updating = h.manager.refresh(options);
    await new Promise(setImmediate);
    h.manager.refresh({
        ...options,
        location: { latitude: 43.05, longitude: -89.45 },
    });
    finish();
    await updating;
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.match(h.manager.getSnapshot().error, /Location changed/);
});

test('failed updates and cleanup report retained-release context without changing the active graph', async () => {
    const reports = [];
    const h = harness({
        fetchControl: async () => {
            throw Error('offline');
        },
        cleanup: async () => {
            throw Error('disk');
        },
        onError: (...args) => reports.push(args),
    });
    await h.manager.refresh(options);
    assert.deepEqual(
        reports.map(([stage]) => stage),
        ['release_update', 'cache_cleanup'],
    );
    assert.ok(
        reports.every(
            ([, , context]) =>
                context.release === bundled.release &&
                context.fallback === 'retained_release',
        ),
    );
    assert.equal(h.manager.getState().active.release, bundled.release);
});

test('a regional catalog can switch within a release and keeps distinct offline metadata', async () => {
    const { corridorCatalogIdentity, corridorRegion } =
        await import('../road-corridor-releases.js');
    const region = corridorRegion(options.location);
    const regional = { ...bundled, region };
    const h = harness({
        bundled: regional,
        fetchControl: async () => ({
            enabled: true,
            catalog: { ...bundled, region: '-44_21' },
        }),
    });
    await h.manager.refresh({
        ...options,
        location: { ...options.location, longitude: -87.99 },
    });
    assert.equal(h.manager.getState().active.region, '-44_21');
    assert.equal(h.saved().previous.region, region);
    const restarted = harness({ read: async () => h.saved() });
    await restarted.manager.ready();
    assert.equal(restarted.manager.getState().active.region, '-44_21');
    assert.notEqual(
        corridorCatalogIdentity(regional),
        corridorCatalogIdentity({ ...regional, region: '-44_21' }),
    );
});

test('regional discovery rejects mismatched regions and still observes the global kill switch', async () => {
    const h = harness({
        fetchControl: async () => ({
            enabled: true,
            catalog: { ...bundled, region: '-10_10' },
        }),
    });
    await h.manager.refresh(options);
    assert.equal(h.manager.getState().active.region, undefined);
    assert.match(h.manager.getSnapshot().error, /Unexpected corridor region/);
    const disabled = harness({
        bundled: { ...bundled, region: '-45_21' },
        fetchControl: async () => ({ enabled: false }),
    });
    await disabled.manager.refresh(options);
    assert.equal(disabled.manager.getState().enabled, false);
});

test('regional rollback drops a cached national catalog even outside Wisconsin', async () => {
    const regional = { ...bundled, region: '-45_21', release: 'national' };
    const h = harness({
        read: async () => ({ active: regional, enabled: true }),
        fetchControl: async () => ({
            enabled: true,
            regional_enabled: false,
            catalog: bundled,
        }),
    });
    await h.manager.refresh({
        location: { longitude: -122.33, latitude: 47.6 },
        radiusMeters: 3200,
    });
    assert.equal(h.manager.getState().active.region, undefined);
    assert.equal(h.manager.getState().active.release, bundled.release);
    assert.equal(h.saved().active.region, undefined);
});
