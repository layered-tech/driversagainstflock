import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chunkUniqueValues, mapWithConcurrency } from '../request-batching.js';

describe('OSM request batching', () => {
    test('deduplicates values and caps chunk size', () => {
        const values = [...Array.from({ length: 205 }, (_, index) => index), 7];
        const chunks = chunkUniqueValues(values, 100);

        assert.deepEqual(
            chunks.map((chunk) => chunk.length),
            [100, 100, 5],
        );
        assert.equal(chunks.flat().filter((value) => value === 7).length, 1);
    });

    test('bounds concurrent work while preserving result order', async () => {
        let activeCount = 0;
        let maximumActiveCount = 0;
        const resolvers = [];
        const work = mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
            activeCount += 1;
            maximumActiveCount = Math.max(maximumActiveCount, activeCount);

            await new Promise((resolve) => resolvers.push(resolve));

            activeCount -= 1;

            return value * 10;
        });

        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(activeCount, 2);

        resolvers.shift()();
        await new Promise((resolve) => setImmediate(resolve));
        resolvers.shift()();
        await new Promise((resolve) => setImmediate(resolve));
        resolvers.shift()();
        await new Promise((resolve) => setImmediate(resolve));
        resolvers.shift()();

        assert.deepEqual(await work, [10, 20, 30, 40]);
        assert.equal(maximumActiveCount, 2);
    });
});
