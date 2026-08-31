import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    acquireOperationLock,
    releaseOperationLock,
} from '../../../lib/auth/operation-lock.js';

const authSource = readFileSync(
    new URL('../../../lib/auth.js', import.meta.url),
    'utf8',
);
const primitivesSource = readFileSync(
    new URL('../../design-system/primitives.js', import.meta.url),
    'utf8',
);

describe('authentication request ownership', () => {
    test('allows only one owner until the operation releases its lock', () => {
        const lockRef = { current: false };

        assert.equal(acquireOperationLock(lockRef), true);
        assert.equal(acquireOperationLock(lockRef), false);

        releaseOperationLock(lockRef);

        assert.equal(acquireOperationLock(lockRef), true);
    });

    test('acquires the sign-in lock before asynchronous PKCE work', () => {
        const signInSource = authSource.match(
            /const signInWithOpenStreetMap = useCallback\(async \(\) => \{[\s\S]*?\n    \}, \[[^\]]*\]\);/,
        )?.[0];

        assert.ok(signInSource);
        assert.ok(
            signInSource.indexOf('acquireOperationLock') <
                signInSource.indexOf('await createPKCEChallenge'),
        );
        assert.match(signInSource, /finally \{[\s\S]*?releaseOperationLock/);
    });

    test('treats a loading button as disabled', () => {
        assert.match(
            primitivesSource,
            /const isDisabled = disabled \|\| loading;/,
        );
        assert.match(primitivesSource, /disabled=\{isDisabled\}/);
        assert.match(
            primitivesSource,
            /accessibilityState=\{\{ busy: loading, disabled: isDisabled \}\}/,
        );
    });
});
