import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { groupDuoMapToolbar } = require('../../plugins/withDuoMapToolbar');

test('native map toolbar patch routes items through existing native event and image handling', () => {
    const source = readFileSync(
        new URL(
            '../../node_modules/react-native-screens/ios/RNSScreenStackHeaderConfig.mm',
            import.meta.url,
        ),
        'utf8',
    );
    const patched = groupDuoMapToolbar(source);
    assert.equal(groupDuoMapToolbar(patched), patched);
    assert.match(patched, /hasPrefix:@"daf-map-toolbar:"/);
    assert.match(patched, /setToolbarItems:dafToolbarItems animated:NO/);
    assert.match(patched, /setToolbarHidden:dafToolbarItems.count == 0/);
    assert.match(patched, /barButtonItemsFromConfigs:dafToolbarConfigs/);
    assert.match(
        patched,
        /navitem.additionalOverflowItems = dafOverflowActions.count/,
    );
    assert.match(patched, /sendAction:item.action to:item.target/);
    assert.match(
        patched,
        /if \(shouldHide\)[\s\S]*?setToolbarItems:nil[\s\S]*?setToolbarHidden:YES/,
    );
    assert.ok(
        require('../../app.config').plugins.includes(
            './plugins/withDuoMapToolbar',
        ),
    );
});

test('native map toolbar patch fails if the upstream header changes', () => {
    assert.throws(
        () => groupDuoMapToolbar('changed'),
        /implementation changed/,
    );
});
