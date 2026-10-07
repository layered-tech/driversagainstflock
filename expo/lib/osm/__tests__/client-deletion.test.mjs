import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTourModule } from '../../../components/map/__tests__/tour-test-helpers.mjs';
import { runChangesetUpload } from '../changeset-lifecycle.js';
import { normalizeOSMRequestError, throwOSMResponseError } from '../errors.js';
import * as xml from '../xml.js';

function loadClient(uploadResponse) {
    const requests = [];
    const response = (body, status = 200) => ({
        ok: status < 400,
        status,
        text: async () => body,
    });
    const client = loadTourModule(new URL('../client.js', import.meta.url), {
        'expo-constants': { default: { expoConfig: { version: 'test' } } },
        'react-native': { Platform: { OS: 'android' } },
        '../auth/http': {
            fetchWithTimeout: async (url, options) => {
                requests.push({ url, ...options });

                if (url.endsWith('/create')) {
                    return response('42');
                }

                if (url.endsWith('/upload')) {
                    return response(uploadResponse.body, uploadResponse.status);
                }

                return response('');
            },
        },
        '../auth/urls': {},
        '../crashlytics': { addCrashlyticsLog: () => {} },
        './api-mocks': { osmApiMocksAreEnabled: () => false },
        './changeset-lifecycle': { runChangesetUpload },
        './config': { getOSMApiBaseURL: () => 'https://osm.example/api/0.6' },
        './errors': { normalizeOSMRequestError, throwOSMResponseError },
        './normalizers': {},
        './request-batching': {},
        './xml': xml,
    });

    return { client, requests };
}

const deletion = {
    accessToken: 'test-token',
    changesetTags: { comment: 'Remove a duplicate camera', source: 'survey' },
    node: { id: 123, latitude: 30, longitude: -97, version: 2 },
};

test('deletion creates a changeset, uploads the versioned node, then closes it', async () => {
    const { client, requests } = loadClient({
        body: '<diffResult><node old_id="123"/></diffResult>',
        status: 200,
    });

    const result = await client.publishNodeDeletion(deletion);

    assert.deepEqual(result, { changesetId: 42, closeFailed: false });
    assert.deepEqual(
        requests.map(({ method, url }) => `${method} ${url}`),
        [
            'PUT https://osm.example/api/0.6/changeset/create',
            'POST https://osm.example/api/0.6/changeset/42/upload',
            'PUT https://osm.example/api/0.6/changeset/42/close',
        ],
    );
    assert.match(
        requests[1].body,
        /<delete><node id="123" changeset="42" version="2"/,
    );
    assert.equal(requests[1].headers.Authorization, 'Bearer test-token');
});

test('a server version conflict is preserved while its changeset is cleaned up', async () => {
    const detail = 'Version mismatch: Provided 2, server had: 3 of Node 123';
    const { client, requests } = loadClient({ body: detail, status: 409 });

    await assert.rejects(client.publishNodeDeletion(deletion), (error) => {
        assert.equal(error.detail, detail);
        assert.equal(error.status, 409);
        assert.match(error.message, /changed on OpenStreetMap/);
        return true;
    });

    assert.ok(requests[1].url.endsWith('/upload'));
    assert.ok(requests[2].url.endsWith('/close'));
});

test('publishes additions and multiple removals atomically in one upload', async () => {
    const { client, requests } = loadClient({
        body: '<diffResult><node old_id="-1" new_id="900" new_version="1"/><node old_id="123"/><node old_id="456"/></diffResult>',
        status: 200,
    });
    const result = await client.publishNodes({
        accessToken: deletion.accessToken,
        changesetTags: deletion.changesetTags,
        nodes: [{ lat: 31, lon: -98, tags: { man_made: 'surveillance' } }],
        deletedNodes: [deletion.node, { ...deletion.node, id: 456 }],
    });

    assert.equal(requests.length, 3);
    assert.match(
        requests[1].body,
        /<create>.*<\/create><delete>.*id="123".*id="456".*<\/delete>/,
    );
    assert.equal(result.nodes.length, 1);
    assert.equal(result.deletedNodes.length, 2);
});

test('publishes a removal-only batch without an empty create block', async () => {
    const { client, requests } = loadClient({
        body: '<diffResult><node old_id="123"/></diffResult>',
        status: 200,
    });
    const result = await client.publishNodes({
        ...deletion,
        nodes: [],
        deletedNodes: [deletion.node],
    });
    assert.doesNotMatch(requests[1].body, /<create>/);
    assert.match(requests[1].body, /<delete>/);
    assert.deepEqual(result.nodes, []);
});
