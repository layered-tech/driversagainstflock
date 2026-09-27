import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

test('only changed Android Auto chrome reaches the native template', () => {
    assert.match(autoPlaySource, /let lastAppliedMapButtonsKey = null/);
    assert.match(autoPlaySource, /let lastAppliedHeaderActionsKey = null/);
    assert.match(
        autoPlaySource,
        /mapButtonsKey !== lastAppliedMapButtonsKey[\s\S]*?setMapButtons\(mapButtons\)/,
    );
    assert.match(
        autoPlaySource,
        /headerActionsKey !== lastAppliedHeaderActionsKey[\s\S]*?setHeaderActions\(headerActions\)/,
    );
    assert.match(
        autoPlaySource,
        /setMapButtons\(mapButtons\)\.catch\([\s\S]*?lastAppliedMapButtonsKey = null/,
    );
    assert.match(
        autoPlaySource,
        /setHeaderActions\(headerActions\)\.catch\([\s\S]*?lastAppliedHeaderActionsKey = null/,
    );
    assert.match(
        autoPlaySource,
        /rootMapTemplateIsReady = false;[\s\S]*?lastAppliedMapButtonsKey = null[\s\S]*?lastAppliedHeaderActionsKey = null/,
    );
    assert.match(
        autoPlaySource,
        /const initialRootMapHeaderActions = getRootMapHeaderActions\(\);[\s\S]*?lastAppliedHeaderActionsKey = getTemplateChromeKey\([\s\S]*?initialRootMapHeaderActions/,
    );
});
