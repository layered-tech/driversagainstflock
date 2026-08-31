import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    getNextHotlistPage,
    mergeHotlistPages,
} from '../../hotlist-pagination.js';

const hotlistApiSource = readFileSync(
    new URL('../../hotlist-api.js', import.meta.url),
    'utf8',
);
const hotlistScreenSource = readFileSync(
    new URL('../../hotlist-screen.js', import.meta.url),
    'utf8',
);

function payload(currentPage, lastPage, nodes) {
    return {
        nodes: {
            currentPage,
            data: nodes,
            lastPage,
            total: 3,
        },
    };
}

describe('mobile hotlist lifecycle', () => {
    test('merges pages without duplicating a node returned twice', () => {
        const firstPage = payload(1, 2, [
            { id: 'one', osmId: 1 },
            { id: 'two', osmId: 2 },
        ]);
        const secondPage = payload(2, 2, [
            { id: 'two', osmId: 2 },
            { id: 'three', osmId: 3 },
        ]);

        const merged = mergeHotlistPages(firstPage, secondPage);

        assert.deepEqual(
            merged.nodes.data.map((node) => node.id),
            ['one', 'two', 'three'],
        );
        assert.equal(merged.nodes.currentPage, 2);
        assert.equal(getNextHotlistPage(merged), null);
    });

    test('returns the next page while the API reports more data', () => {
        assert.equal(getNextHotlistPage(payload(1, 3, [])), 2);
        assert.equal(getNextHotlistPage(null), null);
    });

    test('sends the requested page to the API', () => {
        assert.match(hotlistApiSource, /page = 1/);
        assert.match(
            hotlistApiSource,
            /buildApiURL\('v1\/hotlist', \{[\s\S]*?page,/,
        );
    });

    test('owns one abortable request and ignores superseded responses', () => {
        assert.match(hotlistScreenSource, /requestControllerRef/);
        assert.match(hotlistScreenSource, /requestGenerationRef/);
        assert.match(
            hotlistScreenSource,
            /requestControllerRef\.current\?\.abort\(\)/,
        );
        assert.match(
            hotlistScreenSource,
            /requestGeneration !== requestGenerationRef\.current/,
        );
        assert.equal(
            (hotlistScreenSource.match(/getHotlist\(/g) ?? []).length,
            1,
        );
    });
});
