import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    normalizeOsmJsonChangeset,
    normalizeOsmJsonNode,
} from '../normalizers.js';

describe('normalizeOsmJsonNode', () => {
    test('normalizes a visible node element', () => {
        assert.deepEqual(
            normalizeOsmJsonNode({
                changeset: 171224908,
                id: 12100881,
                lat: 37.7832121,
                lon: -122.4074189,
                tags: { man_made: 'surveillance' },
                timestamp: '2026-07-11T17:02:01Z',
                type: 'node',
                uid: 21937416,
                user: 'daf_mapper',
                version: 1,
            }),
            {
                id: 12100881,
                latitude: 37.7832121,
                longitude: -122.4074189,
                tags: { man_made: 'surveillance' },
                timestamp: '2026-07-11T17:02:01Z',
                uid: 21937416,
                user: 'daf_mapper',
                version: 1,
                visible: true,
            },
        );
    });

    test('treats a missing visible attribute as visible', () => {
        assert.equal(normalizeOsmJsonNode({ id: 1, version: 2 }).visible, true);
    });

    test('normalizes a deleted node without coordinates or tags', () => {
        assert.deepEqual(
            normalizeOsmJsonNode({
                id: 12100881,
                timestamp: '2026-07-11T18:00:00Z',
                type: 'node',
                uid: 21937416,
                user: 'daf_mapper',
                version: 2,
                visible: false,
            }),
            {
                id: 12100881,
                latitude: null,
                longitude: null,
                tags: {},
                timestamp: '2026-07-11T18:00:00Z',
                uid: 21937416,
                user: 'daf_mapper',
                version: 2,
                visible: false,
            },
        );
    });

    test('keeps zero coordinates instead of nulling them', () => {
        const node = normalizeOsmJsonNode({
            id: 1,
            lat: 0,
            lon: 0,
            version: 1,
        });

        assert.equal(node.latitude, 0);
        assert.equal(node.longitude, 0);
    });

    test('defaults missing user details to null', () => {
        const node = normalizeOsmJsonNode({ id: 7, version: 1 });

        assert.equal(node.uid, null);
        assert.equal(node.user, null);
        assert.equal(node.timestamp, null);
        assert.deepEqual(node.tags, {});
    });
});

describe('normalizeOsmJsonChangeset', () => {
    test('normalizes an OSM changeset listing entry', () => {
        assert.deepEqual(
            normalizeOsmJsonChangeset({
                changes_count: 2,
                closed_at: '2026-07-11T17:02:11Z',
                comments_count: 0,
                created_at: '2026-07-11T17:02:01Z',
                id: 171224908,
                open: false,
                tags: { comment: 'Added 2 ALPR cameras' },
                uid: 21937416,
                user: 'daf_mapper',
            }),
            {
                changesCount: 2,
                closedAt: '2026-07-11T17:02:11Z',
                createdAt: '2026-07-11T17:02:01Z',
                id: 171224908,
                open: false,
                tags: { comment: 'Added 2 ALPR cameras' },
            },
        );
    });

    test('defaults optional fields for an open changeset', () => {
        assert.deepEqual(
            normalizeOsmJsonChangeset({
                created_at: '2026-07-11T17:02:01Z',
                id: 171224909,
                open: true,
            }),
            {
                changesCount: 0,
                closedAt: null,
                createdAt: '2026-07-11T17:02:01Z',
                id: 171224909,
                open: true,
                tags: {},
            },
        );
    });
});
