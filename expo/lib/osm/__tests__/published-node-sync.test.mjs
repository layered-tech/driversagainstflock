import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildPublishedNodeSyncPayload,
    getUploadedNodeIndex,
} from '../published-node-sync.js';

describe('getUploadedNodeIndex', () => {
    test('maps negative OSM upload ids back to their source-node index', () => {
        assert.equal(getUploadedNodeIndex({ oldId: -1 }, 8), 0);
        assert.equal(getUploadedNodeIndex({ oldId: -3 }, 8), 2);
    });

    test('uses the response position when OSM omits a usable old id', () => {
        assert.equal(getUploadedNodeIndex({ oldId: null }, 4), 4);
        assert.equal(getUploadedNodeIndex({ oldId: 12 }, 5), 5);
    });
});

describe('buildPublishedNodeSyncPayload', () => {
    test('correlates reordered diff results by old id and includes only ALPR nodes', () => {
        const payload = buildPublishedNodeSyncPayload({
            changesetId: 171224908,
            diffNodes: [
                { newId: 12100883, newVersion: 1, oldId: -3 },
                { newId: 12100882, newVersion: 1, oldId: -2 },
                { newId: 12100881, newVersion: 1, oldId: -1 },
            ],
            sourceNodes: [
                {
                    lat: 30.2671,
                    lon: -97.7431,
                    tags: {
                        man_made: 'surveillance',
                        'surveillance:type': 'ALPR',
                    },
                },
                {
                    lat: 30.2672,
                    lon: -97.7432,
                    tags: {
                        man_made: 'surveillance',
                        'surveillance:type': 'camera',
                    },
                },
                {
                    lat: 30.2673,
                    lon: -97.7433,
                    tags: {
                        man_made: 'surveillance',
                        'surveillance:type': 'ALPR',
                    },
                },
            ],
        });

        assert.deepEqual(payload, {
            changeset_id: 171224908,
            nodes: [
                { id: 12100883, version: 1 },
                { id: 12100881, version: 1 },
            ],
        });
    });

    test('omits invalid diff entries and entries without a matching ALPR source node', () => {
        const payload = buildPublishedNodeSyncPayload({
            changesetId: 171224909,
            diffNodes: [
                { newId: 12100891, newVersion: 1, oldId: -1 },
                { newId: null, newVersion: 1, oldId: -1 },
                { newId: -4, newVersion: 1, oldId: -1 },
                { newId: 12100892, newVersion: null, oldId: -1 },
                { newId: 12100893, newVersion: 0, oldId: -1 },
                { newId: 12100894, newVersion: 1, oldId: -9 },
                null,
            ],
            sourceNodes: [
                {
                    tags: {
                        man_made: 'surveillance',
                        'surveillance:type': 'ALPR',
                    },
                },
            ],
        });

        assert.deepEqual(payload, {
            changeset_id: 171224909,
            nodes: [{ id: 12100891, version: 1 }],
        });
    });
});
