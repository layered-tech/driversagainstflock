import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('navigation query parsing decodes Unicode and handles malformed input', () => {
    const queryString = require('query-string');

    assert.deepEqual(
        { ...queryString.parse('name=%E2%9C%93&broken=%C2&repeat=a&repeat=b') },
        { name: '✓', broken: '�', repeat: ['a', 'b'] },
    );
});

test('navigation query parsing handles long malformed percent sequences', () => {
    const result = require('node:child_process').spawnSync(
        process.execPath,
        ['-e', "require('query-string').parse('value=' + '%C2'.repeat(20000))"],
        { cwd: new URL('../..', import.meta.url), timeout: 3000 },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr?.toString());
});

test('Metro reads image dimensions with the patched image parser', () => {
    const { getAssetSize } = require(
        path.join(
            path.dirname(require.resolve('metro/package.json')),
            'src/Assets.js',
        ),
    );
    const logo = readFileSync(
        new URL('../../assets/images/app-logo.png', import.meta.url),
    );

    assert.deepEqual(getAssetSize('png', logo, 'app-logo.png'), {
        width: 1024,
        height: 1024,
    });
});

test('the image parser rejects zero-length ICNS chunks without hanging', () => {
    const result = require('node:child_process').spawnSync(
        process.execPath,
        [
            '-e',
            `
            const data = Buffer.alloc(16);
            data.write('icns');
            data.writeUInt32BE(16, 4);
            data.write('ic07', 8);
            try {
                require('image-size').imageSize(data);
                process.exitCode = 1;
            } catch {}
        `,
        ],
        { cwd: new URL('../..', import.meta.url), timeout: 3000 },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr?.toString());
});

test('Xcode config tooling generates unique project identifiers', () => {
    const project = require('xcode').project('unused.pbxproj');
    project.hash = { project: { objects: {} } };
    const identifiers = Array.from({ length: 100 }, () =>
        project.generateUuid(),
    );

    assert.equal(new Set(identifiers).size, 100);
    for (const identifier of identifiers) {
        assert.match(identifier, /^[A-F0-9]{24}$/);
    }
});

test('Firebase gRPC tooling retains its client credential API', () => {
    const grpc = require('@grpc/grpc-js');

    assert.equal(typeof grpc.credentials.createSsl, 'function');
    assert.equal(typeof grpc.Client, 'function');
    assert.ok(grpc.credentials.createInsecure());
});
