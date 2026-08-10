import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const e2eHandlerSource = readFileSync(
    new URL('../../root/e2e-map-api-mock-handler.js', import.meta.url),
    'utf8',
);

test('Android Auto E2E commands remain development-only and use the host request path', () => {
    assert.match(
        autoPlaySource,
        /export function dispatchAutoPlayE2ECommand[\s\S]*?e2eMapApiMocksCanBeEnabled\(\)[\s\S]*?\['directions', 'navigation', 'search'\]\.includes\(requestType\)[\s\S]*?handleVoiceNavigationWhenReady\(null, normalizedQuery, requestType\)/,
    );
});

test('the runtime mock link enables deterministic APIs before dispatching the car command', () => {
    assert.match(
        e2eHandlerSource,
        /setMapApiMocksEnabled\(true\)[\s\S]*?setOSMApiMocksEnabled\(true\)[\s\S]*?getE2EAutoPlayCommandFromURL\(value\)[\s\S]*?dispatchAutoPlayE2ECommand\(autoPlayCommand\)/,
    );
});
