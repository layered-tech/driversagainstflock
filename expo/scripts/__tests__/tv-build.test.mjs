import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    commandFor,
    installTvDev,
    productionEnvironment,
    withTvVersion,
} from '../build-tv.mjs';

function fixture(t) {
    const repository = mkdtempSync(join(tmpdir(), 'tv-build-test-'));
    t.after(() => rmSync(repository, { recursive: true, force: true }));
    const tv = join(repository, 'android-tv');
    const expo = join(repository, 'expo');
    mkdirSync(tv);
    mkdirSync(expo);
    writeFileSync(
        join(tv, 'version-code.json'),
        JSON.stringify({ lastVersionCode: 0 }),
    );
    writeFileSync(join(repository, 'upload.jks'), 'fixture upload key');
    const signing = {
        TV_RELEASE_STORE_FILE: 'upload.jks',
        TV_RELEASE_STORE_PASSWORD: 'fixture-store-secret',
        TV_RELEASE_KEY_ALIAS: 'upload',
        TV_RELEASE_KEY_PASSWORD: 'fixture-key-secret',
    };
    return { repository, tv, expo, signing };
}

function remoteCounter(initial = 346) {
    let code = initial;
    return {
        latest: async () => ({ id: String(code), code }),
        reserve: async (next) => {
            code = next;
        },
    };
}

function savedCode(tv) {
    return JSON.parse(readFileSync(join(tv, 'version-code.json'), 'utf8'))
        .lastVersionCode;
}

test('root TV scripts select dev install and production bundle tasks', () => {
    const scripts = JSON.parse(
        readFileSync(new URL('../../../package.json', import.meta.url)),
    ).scripts;
    for (const [script, mode, task] of [
        ['build:tv:dev', 'install', ':app:assembleDebug'],
        ['build:tv:production', 'production', ':app:bundleRelease'],
    ]) {
        assert.equal(
            scripts[script],
            `node ./expo/scripts/build-tv.mjs ${mode}`,
        );
        assert.ok(commandFor(mode).includes(task));
    }
    assert.equal(scripts['build:tv:production-apk'], undefined);
    assert.throws(
        () => commandFor('production-apk'),
        /Use local, install, or production/,
    );
});

function deviceFixture(
    t,
    { tvSerials = ['emulator-5554'], selectedSerial } = {},
) {
    const { repository, tv } = fixture(t);
    const sdk = join(repository, 'sdk');
    mkdirSync(join(sdk, 'platform-tools'), { recursive: true });
    writeFileSync(join(sdk, 'platform-tools/adb'), 'fixture adb');
    const apk = join(tv, 'app/build/outputs/apk/debug/app-debug.apk');
    const calls = [];
    const execute = (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === 'devices') {
            return {
                status: 0,
                stdout: 'List of devices attached\nemulator-5554 device model:Android_TV\nemulator-5556 device model:Pixel_10_Pro_XL\nemulator-5558 device model:Android_TV_2\n',
            };
        }
        if (args.includes('features')) {
            return {
                status: 0,
                stdout: tvSerials.includes(args[1])
                    ? 'feature:android.hardware.type.television\nfeature:android.software.leanback\n'
                    : 'feature:android.hardware.telephony\n',
            };
        }
        if (args.includes(':app:assembleDebug')) {
            mkdirSync(join(tv, 'app/build/outputs/apk/debug'), {
                recursive: true,
            });
            writeFileSync(apk, 'fixture APK');
            return { status: 0 };
        }
        return { status: 0, stdout: 'Success\n' };
    };
    return {
        calls,
        apk,
        options: {
            environment: {
                ANDROID_HOME: sdk,
                ...(selectedSerial ? { ANDROID_SERIAL: selectedSerial } : {}),
            },
            tvDirectory: tv,
            execute,
            output: () => {},
        },
    };
}

test('dev install selects the TV emulator and never installs on the Pixel', (t) => {
    const { calls, apk, options } = deviceFixture(t);
    assert.equal(installTvDev(options), 0);
    assert.ok(calls.some(({ args }) => args.includes(':app:assembleDebug')));
    assert.deepEqual(calls.find(({ args }) => args.includes('install')).args, [
        '-s',
        'emulator-5554',
        'install',
        '-r',
        apk,
    ]);
    assert.deepEqual(calls.find(({ args }) => args.includes('start')).args, [
        '-s',
        'emulator-5554',
        'shell',
        'am',
        'start',
        '-n',
        'com.anonymous.drivefree.dev/org.driversagainstflock.tv.MainActivity',
    ]);
    assert.equal(
        calls.some(({ args }) => args.includes(':app:installDebug')),
        false,
    );
});

test('dev install rejects a phone or ambiguous TVs before Gradle', (t) => {
    for (const settings of [
        { tvSerials: [], selectedSerial: 'emulator-5556' },
        { tvSerials: ['emulator-5554', 'emulator-5558'] },
    ]) {
        const { calls, options } = deviceFixture(t, settings);
        assert.throws(
            () => installTvDev(options),
            /No connected Android TV|Multiple Android TV/,
        );
        assert.equal(
            calls.some(({ args }) => args.includes(':app:assembleDebug')),
            false,
        );
    }
});

test('dev install respects ANDROID_SERIAL when multiple TVs are connected', (t) => {
    const { calls, options } = deviceFixture(t, {
        tvSerials: ['emulator-5554', 'emulator-5558'],
        selectedSerial: 'emulator-5558',
    });
    assert.equal(installTvDev(options), 0);
    assert.deepEqual(
        calls.find(({ args }) => args.includes('install')).args.slice(0, 2),
        ['-s', 'emulator-5558'],
    );
});

test('dev install preview selects a TV without building or installing', (t) => {
    const { calls, options } = deviceFixture(t);
    assert.equal(installTvDev({ ...options, checkOnly: true }), 0);
    assert.equal(
        calls.some(
            ({ args }) =>
                args.includes(':app:assembleDebug') || args.includes('install'),
        ),
        false,
    );
});

test('TV release uses the existing Play app ID and the TV form factor', () => {
    const gradle = readFileSync(
        new URL('../../../android-tv/app/build.gradle.kts', import.meta.url),
        'utf8',
    );
    const manifest = readFileSync(
        new URL(
            '../../../android-tv/app/src/main/AndroidManifest.xml',
            import.meta.url,
        ),
        'utf8',
    );
    assert.match(gradle, /applicationId = "com\.anonymous\.drivefree"/);
    assert.match(gradle, /debug\s*\{\s*applicationIdSuffix = "\.dev"/);
    assert.match(
        manifest,
        /android\.software\.leanback" android:required="true"/,
    );
});

test('TV launcher declares an icon and a full-size home screen banner', () => {
    const resources = new URL(
        '../../../android-tv/app/src/main/',
        import.meta.url,
    );
    const manifest = readFileSync(
        new URL('AndroidManifest.xml', resources),
        'utf8',
    );
    assert.match(manifest, /android:icon="@drawable\/app_logo"/);
    assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
    assert.match(manifest, /android.intent.category.LEANBACK_LAUNCHER/);
    const banner = readFileSync(
        new URL('res/drawable-xhdpi/tv_banner.png', resources),
    );
    assert.equal(banner.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(banner.readUInt32BE(16), 320);
    assert.equal(banner.readUInt32BE(20), 180);
});

test('TV release signing accepts the phone upload key and defaults the version name', (t) => {
    const { repository, expo, signing } = fixture(t);
    const environment = productionEnvironment(signing, {
        repository,
        expoDirectory: expo,
    });
    assert.equal(
        environment.TV_RELEASE_STORE_FILE,
        join(repository, 'upload.jks'),
    );
    assert.equal(environment.TV_VERSION_NAME, '0.1.0');
    assert.throws(
        () =>
            productionEnvironment(
                { ...signing, TV_RELEASE_KEY_ALIAS: 'androiddebugkey' },
                { repository, expoDirectory: expo },
            ),
        /debug key/,
    );
    assert.throws(
        () =>
            productionEnvironment(
                { TV_RELEASE_KEY_ALIAS: 'upload' },
                { repository, expoDirectory: expo },
            ),
        /all four/,
    );
});

test('TV release signing can use the existing Expo credentials file', (t) => {
    const { repository, expo } = fixture(t);
    writeFileSync(
        join(expo, 'credentials.json'),
        JSON.stringify({
            android: {
                keystore: {
                    keystorePath: '../upload.jks',
                    keystorePassword: 'fixture-store-secret',
                    keyAlias: 'upload',
                    keyPassword: 'fixture-key-secret',
                },
            },
        }),
    );
    const environment = productionEnvironment(
        {},
        { repository, expoDirectory: expo },
    );
    assert.equal(
        environment.TV_RELEASE_STORE_FILE,
        join(repository, 'upload.jks'),
    );
    assert.equal(environment.TV_RELEASE_KEY_ALIAS, 'upload');
});

test('TV reserves the shared EAS code before Gradle and retains failed build codes', async (t) => {
    const { tv } = fixture(t);
    const versionClient = remoteCounter();
    const seen = [];
    const build = (status) => async (environment) => {
        seen.push(environment.TV_VERSION_CODE);
        assert.equal(savedCode(tv), Number(environment.TV_VERSION_CODE));
        assert.equal((await versionClient.latest()).code, savedCode(tv));
        return status;
    };
    assert.equal(await withTvVersion(tv, {}, build(0), { versionClient }), 0);
    assert.equal(await withTvVersion(tv, {}, build(17), { versionClient }), 17);
    assert.equal(await withTvVersion(tv, {}, build(0), { versionClient }), 0);
    assert.deepEqual(seen, ['347', '348', '349']);
    assert.equal(savedCode(tv), 349);
    assert.equal(existsSync(join(tv, '.version-code.lock')), false);
});

test('TV preview and lower overrides do not reserve codes or start Gradle', async (t) => {
    const { tv } = fixture(t);
    const versionClient = remoteCounter();
    versionClient.reserve = async () => assert.fail('reserved');
    assert.equal(
        await withTvVersion(tv, {}, () => assert.fail('built'), {
            versionClient,
            checkOnly: true,
        }),
        0,
    );
    await assert.rejects(
        withTvVersion(
            tv,
            { TV_VERSION_CODE: '346' },
            () => assert.fail('built'),
            { versionClient },
        ),
        /greater than 346/,
    );
    assert.equal(savedCode(tv), 0);
});

test('TV rejects concurrent builds and releases the lock after an error', async (t) => {
    const { tv } = fixture(t);
    const versionClient = remoteCounter();
    await assert.rejects(
        withTvVersion(
            tv,
            {},
            async () => {
                await assert.rejects(
                    withTvVersion(tv, {}, () => assert.fail('built'), {
                        versionClient,
                    }),
                    /Another TV release/,
                );
                throw new Error('Gradle failed');
            },
            { versionClient },
        ),
        /Gradle failed/,
    );
    assert.equal(savedCode(tv), 347);
    assert.equal(existsSync(join(tv, '.version-code.lock')), false);
});

test('TV does not build or advance the local counter when EAS fails', async (t) => {
    const { tv } = fixture(t);
    for (const method of ['latest', 'reserve']) {
        const versionClient = remoteCounter();
        versionClient[method] = async () => {
            throw new Error('EAS unavailable');
        };
        await assert.rejects(
            withTvVersion(tv, {}, () => assert.fail('built'), {
                versionClient,
            }),
            /EAS unavailable/,
        );
        assert.equal(savedCode(tv), 0);
    }
});
