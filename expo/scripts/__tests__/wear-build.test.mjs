import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
    getWearReleaseEnvironment,
    withWearVersion,
} from '../build-wear-production.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'wear-build-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const expo = join(root, 'expo');
    const watch = join(root, 'wear-os');
    mkdirSync(join(expo, 'scripts'), { recursive: true });
    mkdirSync(join(expo, 'android/app'), { recursive: true });
    mkdirSync(watch);
    writeFileSync(
        join(watch, 'version-code.json'),
        JSON.stringify({ lastVersionCode: 0 }),
    );
    const script = join(expo, 'scripts/build-wear.sh');
    copyFileSync(new URL('../build-wear.sh', import.meta.url), script);
    copyFileSync(
        new URL('../build-wear-production.mjs', import.meta.url),
        join(expo, 'scripts/build-wear-production.mjs'),
    );
    copyFileSync(
        new URL('../build-wear-staging.mjs', import.meta.url),
        join(expo, 'scripts/build-wear-staging.mjs'),
    );
    writeFileSync(
        join(expo, 'android/app/debug.keystore'),
        'fixture debug key',
    );
    writeFileSync(join(root, 'upload key.jks'), 'fixture upload key');
    // A fake Gradle process exercises the wrapper without generating native builds.
    writeFileSync(
        join(watch, 'gradlew'),
        `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$@" > "$2/invocation"
printf '%s\\n' "\${WEAR_RELEASE_STORE_FILE:-}" "\${WEAR_RELEASE_KEY_ALIAS:-}" > "$2/signing"
printf '%s\\n' "\${WEAR_BUILD_ENV:-}" "\${WEAR_VERSION_CODE:-}" > "$2/profile"
if [[ "\${FAKE_GRADLE_FAIL:-}" == 1 ]]; then exit 17; fi
case "$3" in
  :app:assembleDebug) output="$2/app/build/outputs/apk/debug/app-debug.apk" ;;
  :app:bundleRelease) output="$2/app/build/outputs/bundle/release/app-release.aab" ;;
  *) exit 18 ;;
esac
mkdir -p "$(dirname "$output")"
printf '%s' "$3" > "$output"
`,
        { mode: 0o755 },
    );
    const release = {
        WEAR_VERSION_CODE: '100001',
        WEAR_RELEASE_STORE_FILE: join(root, 'upload key.jks'),
        WEAR_RELEASE_STORE_PASSWORD: 'fixture secret store',
        WEAR_RELEASE_KEY_ALIAS: 'upload',
        WEAR_RELEASE_KEY_PASSWORD: 'fixture secret key',
    };
    const run = (args, env = {}) => {
        const cleanEnv = Object.fromEntries(
            Object.entries(process.env).filter(
                ([key]) => !key.startsWith('WEAR_'),
            ),
        );
        return spawnSync('bash', [script, ...args], {
            encoding: 'utf8',
            cwd: root,
            env: { ...cleanEnv, ...env },
        });
    };
    return { root, watch, expo, release, run };
}

test('staging uses the phone signing key and copies its AAB to the requested path', (t) => {
    const { root, watch, release, run } = fixture(t);
    const output = join(root, 'output with spaces');
    const result = run(['staging'], { ...release, WEAR_OUTPUT_DIR: output });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
        readFileSync(join(output, 'daf-watch-staging.aab'), 'utf8'),
        ':app:bundleRelease',
    );
    assert.equal(
        readFileSync(join(watch, 'invocation'), 'utf8'),
        `-p\n${watch}\n:app:bundleRelease\n--console=plain\n`,
    );
    assert.equal(
        readFileSync(join(watch, 'signing'), 'utf8'),
        `${release.WEAR_RELEASE_STORE_FILE}\n${release.WEAR_RELEASE_KEY_ALIAS}\n`,
    );
    assert.equal(
        readFileSync(join(watch, 'profile'), 'utf8'),
        'staging\n100001\n',
    );
});

test('production builds the signed bundle without exposing signing secrets in arguments or output', (t) => {
    const { watch, release, run } = fixture(t);
    const result = run(['production'], release);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
        readFileSync(
            join(watch, 'build/artifacts/daf-watch-production.aab'),
            'utf8',
        ),
        ':app:bundleRelease',
    );
    assert.equal(
        readFileSync(join(watch, 'profile'), 'utf8'),
        'production\n100001\n',
    );
    const output =
        result.stdout +
        result.stderr +
        readFileSync(join(watch, 'invocation'), 'utf8');
    assert.ok(!output.includes(release.WEAR_RELEASE_STORE_PASSWORD));
    assert.ok(!output.includes(release.WEAR_RELEASE_KEY_PASSWORD));
});

test('missing release settings and debug signing fail before Gradle starts', (t) => {
    const { watch, release, run } = fixture(t);
    for (const key of Object.keys(release)) {
        const result = run(['production'], { ...release, [key]: '' });
        assert.equal(result.status, 1);
        assert.match(result.stderr, new RegExp(key));
    }
    const result = run(['production'], {
        ...release,
        WEAR_RELEASE_KEY_ALIAS: 'androiddebugkey',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /upload key/);
    assert.equal(existsSync(join(watch, 'invocation')), false);
});

test('invalid Play version codes fail before Gradle starts', (t) => {
    const { watch, release, run } = fixture(t);
    for (const version of [
        '0',
        '-1',
        '1.2',
        '001',
        '2147483648',
        '999999999999999999999999',
        'text',
    ]) {
        const result = run(['production'], {
            ...release,
            WEAR_VERSION_CODE: version,
        });
        assert.equal(result.status, 1, version);
        assert.match(result.stderr, /WEAR_VERSION_CODE/);
    }
    assert.equal(existsSync(join(watch, 'invocation')), false);
});

test('missing keystores fail with actionable errors', (t) => {
    const { root, release, run } = fixture(t);
    const staging = run(['staging'], {
        ...release,
        WEAR_RELEASE_STORE_FILE: join(root, 'missing'),
    });
    assert.equal(staging.status, 1);
    assert.match(staging.stderr, /existing upload keystore/);
    const production = run(['production'], {
        ...release,
        WEAR_RELEASE_STORE_FILE: join(root, 'missing'),
    });
    assert.equal(production.status, 1);
    assert.match(production.stderr, /existing upload keystore/);
});

test('failed Gradle invocation does not copy or claim an artifact', (t) => {
    const { watch, release, run } = fixture(t);
    const result = run(['staging'], { ...release, FAKE_GRADLE_FAIL: '1' });
    assert.equal(result.status, 17);
    assert.equal(
        existsSync(join(watch, 'build/artifacts/daf-watch-staging.aab')),
        false,
    );
    assert.doesNotMatch(result.stdout, /artifact:/);
});

test('help and invalid arguments never invoke Gradle', (t) => {
    const { watch, run } = fixture(t);
    assert.equal(run(['--help']).status, 0);
    assert.equal(run([]).status, 1);
    assert.equal(run(['production', '--debug']).status, 1);
    assert.equal(run(['invalid']).status, 1);
    assert.equal(existsSync(join(watch, 'invocation')), false);
});

function writePhoneCredentials(expo) {
    const keystore = {
        keystorePath: '../upload key.jks',
        keystorePassword: 'phone store password',
        keyAlias: 'phone-upload',
        keyPassword: 'phone key password',
    };
    writeFileSync(
        join(expo, 'credentials.json'),
        JSON.stringify({ android: { keystore } }),
    );
    return keystore;
}

test('production wrapper loads the phone credentials without requiring signing exports', (t) => {
    const { expo, watch } = fixture(t);
    const keystore = writePhoneCredentials(expo);
    const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('WEAR_')),
    );
    const result = spawnSync(
        process.execPath,
        [join(expo, 'scripts/build-wear-production.mjs')],
        {
            encoding: 'utf8',
            env: { ...environment, WEAR_VERSION_CODE: '1' },
        },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
        readFileSync(
            join(watch, 'build/artifacts/daf-watch-production.aab'),
            'utf8',
        ),
        ':app:bundleRelease',
    );
    assert.ok(
        !(result.stdout + result.stderr).includes(keystore.keystorePassword),
    );
    const resolved = getWearReleaseEnvironment(expo, {});
    assert.equal(
        resolved.WEAR_RELEASE_STORE_FILE,
        join(expo, '../upload key.jks'),
    );
    assert.equal(
        resolved.WEAR_RELEASE_STORE_PASSWORD,
        keystore.keystorePassword,
    );
    assert.equal(resolved.WEAR_RELEASE_KEY_ALIAS, keystore.keyAlias);
    assert.equal(resolved.WEAR_RELEASE_KEY_PASSWORD, keystore.keyPassword);
});

test('staging wrapper uses the same phone credentials as the EAS staging app', (t) => {
    const { expo, watch } = fixture(t);
    writePhoneCredentials(expo);
    const result = spawnSync(
        process.execPath,
        [join(expo, 'scripts/build-wear-staging.mjs')],
        {
            encoding: 'utf8',
            env: Object.fromEntries(
                Object.entries(process.env).filter(
                    ([key]) => !key.startsWith('WEAR_'),
                ),
            ),
        },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
        readFileSync(
            join(watch, 'build/artifacts/daf-watch-staging.aab'),
            'utf8',
        ),
        ':app:bundleRelease',
    );
    assert.equal(
        readFileSync(join(watch, 'signing'), 'utf8'),
        `${realpathSync(resolve(expo, '../upload key.jks'))}\nphone-upload\n`,
    );
    assert.equal(readFileSync(join(watch, 'profile'), 'utf8'), 'staging\n1\n');
    assert.equal(
        JSON.parse(readFileSync(join(watch, 'version-code.json')))
            .lastVersionCode,
        1,
    );
});

test('complete explicit signing overrides take precedence and partial overrides are rejected', (t) => {
    const { expo, release } = fixture(t);
    writeFileSync(join(expo, 'credentials.json'), 'invalid json');
    assert.deepEqual(getWearReleaseEnvironment(expo, release), release);
    assert.throws(
        () =>
            getWearReleaseEnvironment(expo, {
                WEAR_RELEASE_KEY_ALIAS: 'override',
            }),
        /all four/,
    );
});

test('missing or malformed credentials produce actionable errors without leaking file content', (t) => {
    const { expo } = fixture(t);
    assert.throws(() => getWearReleaseEnvironment(expo, {}), /eas credentials/);
    writeFileSync(
        join(expo, 'credentials.json'),
        '{"secret-password-is-here":',
    );
    assert.throws(
        () => getWearReleaseEnvironment(expo, {}),
        (error) => {
            assert.match(error.message, /Download the credentials again/);
            assert.doesNotMatch(error.message, /secret-password-is-here/);
            return true;
        },
    );
    writeFileSync(join(expo, 'credentials.json'), '{"android":{}}');
    assert.throws(
        () => getWearReleaseEnvironment(expo, {}),
        /android.keystore.keystorePath/,
    );
});

test('local phone credentials cannot refer to missing keystores or debug keys', (t) => {
    const { expo, root } = fixture(t);
    const keystore = writePhoneCredentials(expo);
    keystore.keyAlias = 'androiddebugkey';
    writeFileSync(
        join(expo, 'credentials.json'),
        JSON.stringify({ android: { keystore } }),
    );
    assert.throws(
        () => getWearReleaseEnvironment(expo, {}),
        /not the Android debug key/,
    );
    writePhoneCredentials(expo);
    rmSync(join(root, 'upload key.jks'));
    assert.throws(() => getWearReleaseEnvironment(expo, {}), /does not exist/);
});

test('checking signing configuration never starts Gradle', (t) => {
    const { expo, watch } = fixture(t);
    writePhoneCredentials(expo);
    const result = spawnSync(
        process.execPath,
        [join(expo, 'scripts/build-wear-production.mjs'), '--check-signing'],
        {
            encoding: 'utf8',
            env: Object.fromEntries(
                Object.entries(process.env).filter(
                    ([key]) => !key.startsWith('WEAR_'),
                ),
            ),
        },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No build was started/);
    assert.equal(existsSync(join(watch, 'invocation')), false);
});

test('release codes advance on success, survive failure, and allow higher overrides', (t) => {
    const { watch } = fixture(t);
    const seen = [];
    const build = (status) => (env) => {
        seen.push(env.WEAR_VERSION_CODE);
        return status;
    };
    assert.equal(withWearVersion(watch, {}, build(0)), 0);
    assert.equal(withWearVersion(watch, {}, build(17)), 17);
    assert.equal(withWearVersion(watch, {}, build(0)), 0);
    assert.equal(
        withWearVersion(watch, { WEAR_VERSION_CODE: '10' }, build(0)),
        0,
    );
    assert.equal(withWearVersion(watch, {}, build(0)), 0);
    assert.deepEqual(seen, ['1', '2', '2', '10', '11']);
    assert.throws(
        () => withWearVersion(watch, { WEAR_VERSION_CODE: '11' }, build(0)),
        /greater than 11/,
    );
    assert.equal(existsSync(join(watch, '.version-code.lock')), false);
});

test('parallel releases are rejected and exceptions release the lock', (t) => {
    const { watch } = fixture(t);
    assert.throws(
        () =>
            withWearVersion(watch, {}, () => {
                assert.throws(
                    () => withWearVersion(watch, {}, () => 0),
                    /Another Wear release/,
                );
                throw new Error('build failed');
            }),
        /build failed/,
    );
    assert.equal(existsSync(join(watch, '.version-code.lock')), false);
    assert.equal(
        JSON.parse(readFileSync(join(watch, 'version-code.json')))
            .lastVersionCode,
        0,
    );
});
