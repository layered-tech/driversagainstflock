import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yourEditsScreenSource = readFileSync(
    new URL('../../edits/your-edits-screen.js', import.meta.url),
    'utf8',
);

test('Your Edits opens the app drawer from its header', () => {
    assert.match(
        yourEditsScreenSource,
        /import \{ router, useFocusEffect, useNavigation \} from 'expo-router';/,
    );
    assert.match(
        yourEditsScreenSource,
        /import \{ toggleNearestDrawer \} from '\.\.\/map\/navigation';/,
    );
    assert.match(
        yourEditsScreenSource,
        /const handleDrawerPress = useCallback\(\(\) => \{\s*toggleNearestDrawer\(navigation\);\s*\}, \[navigation\]\);/,
    );
    assert.match(
        yourEditsScreenSource,
        /accessibilityLabel="Open menu"[\s\S]*?onPress=\{handleDrawerPress\}[\s\S]*?testID="your-edits-drawer-button"[\s\S]*?<Icon[\s\S]*?name="menu"/,
    );
    assert.doesNotMatch(yourEditsScreenSource, /your-edits-back-button/);
});
