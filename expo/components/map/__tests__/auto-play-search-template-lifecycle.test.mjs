import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createAutoPlaySearchTemplateLifecycle } from '../../auto-play-search-template-lifecycle.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function createDeferred() {
    let reject;
    let resolve;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });

    return { promise, reject, resolve };
}

describe('Auto Play search-template lifecycle', () => {
    test('waits for every map-backed result push before cleanup continues', async () => {
        const lifecycle = createAutoPlaySearchTemplateLifecycle();
        const firstPush = createDeferred();
        const secondPush = createDeferred();
        let cleanupFinished = false;

        lifecycle.trackResultTemplatePresentation({
            pushPromise: firstPush.promise,
        });
        const cleanupPromise = lifecycle
            .waitForResultTemplatePushes()
            .then(() => {
                cleanupFinished = true;
            });

        lifecycle.trackResultTemplatePresentation({
            pushPromise: secondPush.promise,
        });
        firstPush.resolve(true);
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(cleanupFinished, false);

        secondPush.resolve(true);
        await cleanupPromise;
        assert.equal(cleanupFinished, true);
    });

    test('treats a rejected stale result push as settled', async () => {
        const lifecycle = createAutoPlaySearchTemplateLifecycle();
        const failedPush = createDeferred();

        lifecycle.trackResultTemplatePresentation({
            pushPromise: failedPush.promise,
        });
        const cleanupPromise = lifecycle.waitForResultTemplatePushes();
        failedPush.reject(new Error('template removed'));

        await assert.doesNotReject(cleanupPromise);
    });

    test('gates late result callbacks and waits before removing voice search', () => {
        assert.match(
            autoPlaySource,
            /function presentAndroidAutoSearchResults[\s\S]*?const dismissResults = \(\) => \{\s*if \(!requestIsCurrent\(\)\) \{\s*return;\s*\}[\s\S]*?cancelAutoPlaySearchWork\(\)/,
        );
        assert.match(
            autoPlaySource,
            /resultsTemplate\.push\(\)\.then\([\s\S]*?\(\) => \{\s*if \(requestIsCurrent\(\)\) \{[\s\S]*?clearAutoPlaySubmittedSearchResults\(\)[\s\S]*?updateSearchTemplateResults/,
        );
        assert.match(
            autoPlaySource,
            /async function dismissSupersededVoiceSearchTemplate[\s\S]*?await pendingSearch\.pushPromise\.catch[\s\S]*?await pendingSearch\.waitForResultTemplatePushes\?\.\(\)[\s\S]*?pendingSearch\.template[\s\S]*?\.popTo\(\)/,
        );
    });
});
