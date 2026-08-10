import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaceSearchSessionToken } from '../../../lib/place-search-session.js';

test('creates random UUID session tokens for place searches', () => {
    const firstToken = createPlaceSearchSessionToken();
    const secondToken = createPlaceSearchSessionToken();

    assert.match(
        firstToken,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.match(
        secondToken,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.notEqual(firstToken, secondToken);
});
