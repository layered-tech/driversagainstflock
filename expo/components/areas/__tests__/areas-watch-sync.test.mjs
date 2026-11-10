import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createHookHarness,
    loadTourModule,
} from '../../map/__tests__/tour-test-helpers.mjs';

function harness(platform) {
    const hooks = createHookHarness();
    const syncs = [];
    const requests = [];
    const area = { id: 17, name: 'My area', unread_count: 0 };
    let fail = false;
    const { AreasProvider } = loadTourModule(
        new URL('../areas-context.js', import.meta.url),
        {
            react: {
                ...hooks.react,
                createContext: () => ({ Provider: 'AreasProvider' }),
                useEffect() {},
            },
            'expo-router': { router: {} },
            'react-native': { Platform: { OS: platform }, AppState: {} },
            '../../lib/private-cache-storage': {},
            './area-boundary-cache': {
                createAreaBoundaryCache: () => ({
                    remember: async () => {},
                    replace: async () => {},
                    remove: async () => {},
                }),
            },
            './areas-api': {
                hasAreaDevice: async () => true,
                areaRequest: async (path, options) => {
                    requests.push({ path, options });
                    if (fail) throw new Error('Request failed');
                    return { area, areas: [area] };
                },
            },
            './area-geometry': {},
            './area-notifications': {},
            '../watch/watch-areas-runtime': {
                refreshWatchAreas: async (options) => {
                    syncs.push(options);
                },
            },
        },
    );
    return {
        render: () =>
            hooks.render(() => AreasProvider({ children: null })).props.value,
        syncs,
        requests,
        area,
        fail: () => {
            fail = true;
        },
    };
}

for (const platform of ['ios', 'android', 'web']) {
    test(`${platform} synchronizes watch areas after phone area changes`, async () => {
        const h = harness(platform);
        const supported = platform !== 'web';
        for (const action of [
            (context) => context.saveArea({ name: 'My area' }),
            (context) => context.updateArea(17, { name: 'Updated area' }),
            (context) => context.removeArea(17),
            (context) => context.markRead(17, 42),
        ]) {
            h.syncs.length = 0;
            await action(h.render());
            assert.equal(
                h.syncs.some((options) => options.force === true),
                supported,
            );
        }
    });

    test(`${platform} refreshes the watch after loading existing phone areas`, async () => {
        const h = harness(platform);
        await h.render().refresh();
        assert.deepEqual(h.render().areas, [h.area]);
        assert.equal(h.syncs.length, platform === 'web' ? 0 : 1);
    });
}

test('failed phone requests do not trigger watch refreshes', async () => {
    const h = harness('ios');
    h.fail();
    await h.render().refresh();
    assert.equal(h.render().error, 'Request failed');
    await assert.rejects(
        h.render().saveArea({ name: 'My area' }),
        /Request failed/,
    );
    assert.equal(h.syncs.length, 0);
});
