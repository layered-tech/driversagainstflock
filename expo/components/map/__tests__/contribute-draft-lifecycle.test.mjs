import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { saveDraftBeforeExit } from '../../contribute/contribute-draft-actions.js';

const contributeStateSource = readFileSync(
    new URL('../../contribute/contribute-state.js', import.meta.url),
    'utf8',
);

describe('contribution draft lifecycle', () => {
    test('exits only after the draft reports a successful write', async () => {
        let exitCount = 0;

        assert.equal(
            await saveDraftBeforeExit(
                async () => false,
                () => {
                    exitCount += 1;
                },
            ),
            false,
        );
        assert.equal(exitCount, 0);

        assert.equal(
            await saveDraftBeforeExit(
                async () => true,
                () => {
                    exitCount += 1;
                },
            ),
            true,
        );
        assert.equal(exitCount, 1);
    });

    test('does not use the persistence timestamp to schedule autosaves', () => {
        const autosaveEffect = contributeStateSource.match(
            /useEffect\(\(\) => \{\s+if \(!contributeDraftShouldPersist[\s\S]*?\}, \[[^\]]+\]\);/,
        )?.[0];

        assert.ok(autosaveEffect);
        assert.doesNotMatch(autosaveEffect, /draftUpdatedAt/);
        assert.match(autosaveEffect, /changeset/);
        assert.match(autosaveEffect, /pins/);
    });
});
