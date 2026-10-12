import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yourEditsScreenSource = readFileSync(
    new URL('../../edits/your-edits-screen.js', import.meta.url),
    'utf8',
);

test('Your edits returns directly to the map instead of reopening an earlier camera', () => {
    assert.match(
        yourEditsScreenSource,
        /accessibilityLabel="Back"[\s\S]*?onPress=\{\(\) => router.navigate\('\/'\)\}[\s\S]*?testID="your-edits-back-button"[\s\S]*?<Icon[\s\S]*?name="chevron-left"/,
    );
    assert.doesNotMatch(yourEditsScreenSource, /toggleNearestDrawer/);
});
