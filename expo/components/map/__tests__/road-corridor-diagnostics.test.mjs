import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(
    readFileSync(
        new URL('../road-corridor-diagnostics.js', import.meta.url),
        'utf8',
    ),
    {
        babelrc: false,
        configFile: false,
        plugins: [require('@babel/plugin-transform-modules-commonjs')],
    },
).code;
function harness(mocks) {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        () => mocks,
        module,
        module.exports,
    );
    return module.exports.reportCorridorFailure;
}
test('nonfatal reports include bounded operational context without driving data or signed URLs', () => {
    const logs = [],
        errors = [];
    const report = harness({
        addCrashlyticsLog: (v) => logs.push(v),
        recordCrashlyticsError: (v) => errors.push(v),
    });
    report(
        'tile_download',
        Error('Failed https://s3.test/tile?secret=abc at 43.12345,-88.12345'),
        {
            release: 'release',
            tileSha256: 'a'.repeat(64),
            compressedBytes: 1000,
            elapsedMs: 60000,
            httpStatus: 503,
            latitude: 43.12345,
            longitude: -88.12345,
            url: 'https://s3.test/tile?secret=abc',
            tileId: '-883_431',
            fallback: 'existing_service',
        },
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0].name, 'RoadCorridorError');
    assert.equal(logs[0].data.httpStatus, 503);
    assert.equal(logs[0].data.fallback, 'existing_service');
    assert.equal(logs[0].data.tileSha256, 'a'.repeat(64));
    assert.doesNotMatch(
        JSON.stringify(logs) + errors[0].message,
        /secret|43\.12345|88\.12345|-883_431|s3\.test/,
    );
});
test('reporting SDK failures cannot break matching', () => {
    const report = harness({
        addCrashlyticsLog: () => {
            throw Error('SDK');
        },
    });
    assert.doesNotThrow(() => report('cache_cleanup', Error('disk')));
});
