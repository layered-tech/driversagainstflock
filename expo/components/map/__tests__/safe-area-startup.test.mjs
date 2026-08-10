import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const rootLayoutSource = readFileSync(
    new URL('../../../app/_layout.js', import.meta.url),
    'utf8',
);
const fullScreenSearchSource = readFileSync(
    new URL('../map-full-screen-search.js', import.meta.url),
    'utf8',
);

describe('safe-area startup', () => {
    test('seeds the root provider with native window metrics', () => {
        assert.match(rootLayoutSource, /initialWindowMetrics/);
        assert.match(
            rootLayoutSource,
            /<SafeAreaProvider initialMetrics=\{initialWindowMetrics\}>/,
        );
    });

    test('uses the measured top inset for the full-screen search header', () => {
        assert.match(
            fullScreenSearchSource,
            /const insets = useSafeAreaInsets\(\);/,
        );
        assert.match(fullScreenSearchSource, /paddingTop: insets\.top \+ 12/);
    });
});
