import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlayStateSource = readFileSync(
    new URL('../../auto-play-state.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.ok(start >= 0, `missing ${startToken}`);
    assert.ok(end > start, `missing ${endToken} after ${startToken}`);

    return source.slice(start, end);
}

test('Auto Play state cannot update between render and subscription unnoticed', () => {
    const hookSource = sourceBetween(
        autoPlayStateSource,
        'export function useAutoPlayState()',
        '\n}',
    );
    const usesExternalStoreSnapshot =
        /useSyncExternalStore\([\s\S]*?getAutoPlayState/.test(hookSource);
    const subscriptionIndex = hookSource.indexOf(
        'autoPlayStateListeners.add(setState)',
    );
    const immediateSnapshotIndex = Math.max(
        hookSource.indexOf('setState(autoPlayState)', subscriptionIndex),
        hookSource.indexOf('setState(getAutoPlayState())', subscriptionIndex),
    );
    const resnapshotsImmediatelyAfterSubscribing =
        subscriptionIndex >= 0 && immediateSnapshotIndex > subscriptionIndex;

    assert.ok(
        usesExternalStoreSnapshot || resnapshotsImmediatelyAfterSubscribing,
        'useAutoPlayState must use useSyncExternalStore or resnapshot immediately after subscribing',
    );
});
