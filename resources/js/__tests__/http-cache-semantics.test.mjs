import assert from 'node:assert/strict';
import CachePolicy from 'http-cache-semantics';
import { test } from 'node:test';

const request = {
    url: 'https://example.test/account',
    method: 'GET',
    headers: { host: 'example.test' },
};

for (const vary of [' * ', '*, accept-language', 'accept-language, *']) {
    test(`Vary ${JSON.stringify(vary)} prevents cache reuse`, () => {
        const policy = new CachePolicy(request, {
            status: 200,
            headers: {
                'cache-control': 'public, max-age=60',
                vary,
            },
        });

        assert.equal(policy.satisfiesWithoutRevalidation(request), false);
    });
}

for (const directive of ['private', 'no-store']) {
    test(`${directive} responses cannot be stored in a shared cache`, () => {
        const policy = new CachePolicy(request, {
            status: 200,
            headers: {
                'cache-control': `${directive}, max-age=60`,
                'set-cookie': 'session=another-user; HttpOnly',
            },
        });

        assert.equal(policy.storable(), false);
    });
}

test('public responses remain reusable while fresh', () => {
    const policy = new CachePolicy(request, {
        status: 200,
        headers: { 'cache-control': 'public, max-age=60' },
    });

    assert.equal(policy.satisfiesWithoutRevalidation(request), true);
});

test('max-stale can reuse an expired public response', () => {
    const policy = new CachePolicy(request, {
        status: 200,
        headers: { 'cache-control': 'public, max-age=60', age: '120' },
    });

    assert.equal(policy.satisfiesWithoutRevalidation(request), false);
    assert.equal(
        policy.satisfiesWithoutRevalidation({
            ...request,
            headers: { ...request.headers, 'cache-control': 'max-stale=300' },
        }),
        true,
    );
});
