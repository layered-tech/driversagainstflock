import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

const node = { id: 123, version: 2, latitude: 30, longitude: -97 };
const changeset = {
    comment: 'Surveyed cameras',
    hashtags: '#alpr',
    source: 'survey',
};

function createProvider(storedDraft = null, publishError = null) {
    const hooks = createHookHarness();
    const uploads = [];
    const saves = [];
    const awards = [];
    const tour = {};
    const { ContributeProvider } = loadTourModule(
        new URL('../../contribute/contribute-state.js', import.meta.url),
        {
            react: {
                ...hooks.react,
                createContext: () => ({ Provider: 'Provider' }),
            },
            'expo-router': { router: { replace: () => {} } },
            'react-native': {
                AppState: { addEventListener: () => ({ remove: () => {} }) },
            },
            '../../lib/auth': {
                useAuth: () => ({
                    ensureWriteAccess: async () => ({ token: 'test-token' }),
                }),
            },
            '../../lib/osm/client': {
                publishNodes: async (input) => {
                    uploads.push(input);
                    if (publishError) {
                        throw publishError;
                    }
                    return {
                        changesetId: 42,
                        nodes: input.nodes.map((item, index) => ({
                            oldId: -(index + 1),
                            newId: 900 + index,
                        })),
                    };
                },
                syncPublishedNodesToBackend: async () => ({ points: [] }),
            },
            '../../lib/osm/node-location': {},
            '../../lib/osm/published-node-sync': {
                buildPublishedNodeSyncPayload: () => ({ nodes: [] }),
                getUploadedNodeIndex: (item) => -item.oldId - 1,
            },
            '../../lib/crashlytics': { addCrashlyticsLog: () => {} },
            '../map/shared-map-state': {
                useSharedMapState: () => ({ upsertMarkerPoints: () => {} }),
            },
            '../scorecard/scorecard-context': {
                useScorecard: () => ({
                    recordPublishedCameras: (count) => awards.push(count),
                }),
            },
            './contribute-draft-storage': {
                readStoredDraft: async () => storedDraft,
                readCoachMarkDismissed: async () => false,
                writeStoredDraft: async (draft) => {
                    saves.push(draft);
                    return { ...draft, updatedAt: 'now' };
                },
                clearStoredDraft: async () => {},
            },
            './osm-tags': {
                buildChangesetTags: (value) => value,
                buildNodeTags: (value) => value,
            },
            './use-contribute-tour': { useContributeTour: () => tour },
        },
    );
    const render = () =>
        hooks.render(() => ContributeProvider({ children: null })).props.value;
    return { render, uploads, saves, awards, cleanup: hooks.cleanup };
}

test('stages deduplicated removals without uploading and persists a removal-only draft', async () => {
    const provider = createProvider();
    try {
        await provider.render().stageRemoval(node, 'gone');
        await provider
            .render()
            .stageRemoval({ ...node, version: 3 }, 'duplicate');
        const draft = provider.render();
        assert.equal(draft.pins.length, 0);
        assert.deepEqual(draft.removals, [
            { ...node, version: 3, reason: 'duplicate' },
        ]);
        assert.deepEqual(provider.uploads, []);
        await draft.saveDraft();
        assert.equal(provider.saves.at(-1).removals.length, 1);
        await draft.publish();
        assert.deepEqual(
            provider.awards,
            [],
            'Removal-only changesets do not count as added cameras',
        );
        draft.removeRemoval(node.id);
        assert.deepEqual(provider.render().removals, []);
    } finally {
        provider.cleanup();
    }
});

test('preserves stored additions when staging a removal and publishes both together', async () => {
    const provider = createProvider({
        changeset,
        pins: [
            {
                id: 'pin-1',
                latitude: 31,
                longitude: -98,
                details: { type: 'alpr' },
            },
        ],
        updatedAt: 'before',
    });
    try {
        await provider.render().stageRemoval(node, 'gone');
        const draft = provider.render();
        assert.equal(draft.pins.length, 1);
        assert.deepEqual(draft.changeset, changeset);
        await draft.publish();
        assert.equal(provider.uploads.length, 1);
        assert.equal(provider.uploads[0].nodes.length, 1);
        assert.deepEqual(provider.uploads[0].deletedNodes, [
            { ...node, reason: 'gone' },
        ]);
        assert.deepEqual(provider.awards, [1]);
        assert.equal(provider.render().publishResult.removedNodes.length, 1);
    } finally {
        provider.cleanup();
    }
});

test('an upload rejection preserves removals for review and retry', async () => {
    const provider = createProvider(
        null,
        new Error('Node is still referenced'),
    );
    try {
        await provider.render().stageRemoval(node, 'gone');
        await provider.render().publish();
        const draft = provider.render();
        assert.equal(draft.publishStatus, 'error');
        assert.equal(draft.removals.length, 1);
        assert.equal(draft.publishResult, null);
    } finally {
        provider.cleanup();
    }
});

test('storage resumes removal-only drafts and older addition-only drafts', async () => {
    let value;
    const storage = loadTourModule(
        new URL(
            '../../contribute/contribute-draft-storage.js',
            import.meta.url,
        ),
        {
            '@react-native-async-storage/async-storage': {
                __esModule: true,
                default: {
                    getItem: async () => value,
                    setItem: async (_key, next) => {
                        value = next;
                    },
                },
            },
        },
    );
    await storage.writeStoredDraft({
        changeset,
        pins: [],
        removals: [{ ...node, reason: 'gone' }],
    });
    assert.equal((await storage.readStoredDraft()).removals.length, 1);
    value = JSON.stringify({
        version: 1,
        changeset,
        pins: [{ id: 'pin-1', latitude: 31, longitude: -98, details: {} }],
        updatedAt: 'before',
    });
    const restored = await storage.readStoredDraft();
    assert.equal(restored.pins.length, 1);
    assert.deepEqual(restored.removals, []);
});
