import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    buildAndInstallWearDev,
    chooseEmulator,
    parseConnectedEmulators,
} from '../build-wear-dev.mjs';

function fixture(t, { watches = 2, failBuild = false } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'wear-dev-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const sdk = join(root, 'sdk');
    const watchDirectory = join(root, 'wear-os');
    const apk = join(
        watchDirectory,
        'app/build/outputs/apk/debug/app-debug.apk',
    );
    mkdirSync(join(sdk, 'platform-tools'), { recursive: true });
    mkdirSync(watchDirectory);
    writeFileSync(join(sdk, 'platform-tools/adb'), 'mock');
    const calls = [];
    const run = (command, args, options) => {
        calls.push({
            command,
            args,
            wearBuildEnvironment: options?.env?.WEAR_BUILD_ENV,
        });
        if (args[0] === 'devices')
            return {
                status: 0,
                stdout: 'List of devices attached\nemulator-5554 device model:Wear_OS_Round\nemulator-5556 device model:Pixel_10\nemulator-5558 device model:Wear_OS_Square\n',
            };
        if (args.includes('features'))
            return {
                status: 0,
                stdout:
                    args[1] === 'emulator-5556' ||
                    watches === 0 ||
                    (watches === 1 && args[1] === 'emulator-5558')
                        ? 'feature:android.hardware.camera\r\n'
                        : 'feature:android.hardware.camera\r\nfeature:android.hardware.type.watch\r\n',
            };
        if (args[0] === ':app:assembleDebug') {
            if (failBuild) return { status: 17, stderr: 'Gradle failed' };
            mkdirSync(join(watchDirectory, 'app/build/outputs/apk/debug'), {
                recursive: true,
            });
            writeFileSync(apk, 'debug APK');
            return { status: 0 };
        }
        if (args.includes('install')) return { status: 0, stdout: 'Success\n' };
        if (args.includes('am')) return { status: 0, stdout: 'Starting app\n' };
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };
    return {
        sdk,
        watchDirectory,
        apk,
        calls,
        run,
        output: [],
    };
}

test('device parsing keeps connected emulators and their model names', () => {
    assert.deepEqual(
        parseConnectedEmulators(
            'List of devices attached\nemulator-5554 device model:Wear_OS_Round\nemulator-5556 offline model:Pixel\nR5CT123 device model:Galaxy_Watch\n',
        ),
        [{ serial: 'emulator-5554', model: 'Wear OS Round' }],
    );
});

test('choice requires a listed number', () => {
    const emulators = [{ serial: 'emulator-5554' }];
    assert.equal(chooseEmulator(emulators, '1'), emulators[0]);
    for (const answer of ['', '0', '2', '1.0', '1e0', 'phone']) {
        assert.throws(
            () => chooseEmulator(emulators, answer),
            /Choose a number/,
        );
    }
});

test('builds after selection and installs only on the chosen Wear OS emulator', async (t) => {
    const fixture_ = fixture(t);
    let promptedFor;
    await buildAndInstallWearDev({
        environment: { ANDROID_HOME: fixture_.sdk },
        watchDirectory: fixture_.watchDirectory,
        run: fixture_.run,
        ask: async (count) => {
            promptedFor = count;
            assert.equal(
                fixture_.calls.some(
                    (call) => call.args[0] === ':app:assembleDebug',
                ),
                false,
            );
            return '2';
        },
        output: (message) => fixture_.output.push(message),
    });
    assert.equal(promptedFor, 2);
    assert.deepEqual(fixture_.calls.at(-3).args, [
        ':app:assembleDebug',
        '--console=plain',
    ]);
    assert.equal(fixture_.calls.at(-3).wearBuildEnvironment, 'development');
    assert.deepEqual(fixture_.calls.at(-2).args, [
        '-s',
        'emulator-5558',
        'install',
        '-r',
        fixture_.apk,
    ]);
    assert.deepEqual(fixture_.calls.at(-1).args, [
        '-s',
        'emulator-5558',
        'shell',
        'am',
        'start',
        '-n',
        'com.anonymous.drivefree.dev/org.driversagainstflock.watch.MainActivity',
    ]);
    assert.match(
        fixture_.output.join('\n'),
        /Wear OS Square \(emulator-5558\)/,
    );
});

test('no watch, invalid selection, or failed build never installs', async (t) => {
    const cases = [
        { watches: 0, answer: '1', error: /No running Wear OS emulator/ },
        { watches: 1, answer: '2', error: /Choose a number from 1 to 1/ },
        {
            watches: 1,
            answer: '1',
            failBuild: true,
            error: /Wear OS debug build failed/,
        },
    ];
    for (const scenario of cases) {
        const fixture_ = fixture(t, scenario);
        await assert.rejects(
            buildAndInstallWearDev({
                environment: { ANDROID_HOME: fixture_.sdk },
                watchDirectory: fixture_.watchDirectory,
                run: fixture_.run,
                ask: async () => scenario.answer,
                output: () => {},
            }),
            scenario.error,
        );
        assert.equal(
            fixture_.calls.some((call) => call.args.includes('install')),
            false,
        );
    }
});
