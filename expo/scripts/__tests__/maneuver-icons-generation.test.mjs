import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('maneuver asset converter preserves supported SVGs and rejects unsupported constructs', () => {
    const result = spawnSync(
        'python3',
        [new URL('./test_maneuver_icons.py', import.meta.url).pathname],
        {
            encoding: 'utf8',
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        },
    );
    assert.equal(result.status, 0, result.stderr);
});
