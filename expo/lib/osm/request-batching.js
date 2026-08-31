export function chunkUniqueValues(values, chunkSize) {
    if (!Number.isInteger(chunkSize) || chunkSize < 1) {
        throw new Error('Chunk size must be a positive integer.');
    }

    const uniqueValues = [...new Set(values ?? [])];
    const chunks = [];

    for (let index = 0; index < uniqueValues.length; index += chunkSize) {
        chunks.push(uniqueValues.slice(index, index + chunkSize));
    }

    return chunks;
}

export async function mapWithConcurrency(values, concurrency, mapper) {
    const items = Array.from(values ?? []);

    if (items.length === 0) {
        return [];
    }

    const workerCount = Math.min(
        items.length,
        Math.max(1, Math.trunc(concurrency) || 1),
    );
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
        while (nextIndex < items.length) {
            const itemIndex = nextIndex;

            nextIndex += 1;
            results[itemIndex] = await mapper(items[itemIndex], itemIndex);
        }
    }

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    return results;
}
