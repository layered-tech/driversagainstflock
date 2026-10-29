import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

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

test('the edit-history header removes the notch gap inside the Duo pane or beside its rail', () => {
    const expression = yourEditsScreenSource.match(
        /const headerPaddingTop\s*=\s*([\s\S]*?);/,
    )[1];
    for (const [platform, railEdge, inDuoPane, expected] of [
        ['ios', 'trailing', false, 14],
        ['ios', 'leading', false, 14],
        ['ios', null, true, 14],
        ['ios', null, false, 54],
        ['android', null, false, 16],
    ]) {
        assert.equal(
            runInNewContext(expression, {
                Platform: { OS: platform },
                insets: { top: 0 },
                railEdge,
                inDuoPane,
            }),
            expected,
        );
    }
});

test('edit history summary fills the safe-area background while keeping its text inset', () => {
    assert.match(
        yourEditsScreenSource,
        /<FullWidthSafeAreaBand\s+gutter=\{16\}\s+testID="your-edits-summary-header"/,
    );
});
