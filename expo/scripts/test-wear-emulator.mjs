import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    checkedResult,
    parseConnectedEmulators,
    sdkDirectory,
} from './build-wear-dev.mjs';

export function testWearEmulator({
    environment = process.env,
    run = spawnSync,
    output = console.log,
    extraArgs = [],
} = {}) {
    const sdk = sdkDirectory(environment);
    const adb = sdk ? join(sdk, 'platform-tools/adb') : 'adb';
    const testEnvironment = { ...environment, WEAR_BUILD_ENV: 'development' };
    if (sdk && !testEnvironment.ANDROID_HOME)
        testEnvironment.ANDROID_HOME = sdk;
    const studioJdk =
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
    if (!testEnvironment.JAVA_HOME && existsSync(studioJdk))
        testEnvironment.JAVA_HOME = studioJdk;
    const devices = parseConnectedEmulators(
        checkedResult(
            run(adb, ['devices', '-l'], {
                encoding: 'utf8',
                env: testEnvironment,
            }),
            'ADB device discovery',
        ),
    );
    const watches = devices.filter((device) => {
        if (
            environment.ANDROID_SERIAL &&
            device.serial !== environment.ANDROID_SERIAL
        )
            return false;
        const result = run(
            adb,
            ['-s', device.serial, 'shell', 'pm', 'list', 'features'],
            {
                encoding: 'utf8',
                env: testEnvironment,
            },
        );
        return (
            result.status === 0 &&
            result.stdout
                ?.split(/\r?\n/)
                .some(
                    (line) =>
                        line.trim() === 'feature:android.hardware.type.watch',
                )
        );
    });
    if (!watches.length)
        throw new Error(
            'No running Wear OS emulator found matching the selection. Start one in Android Studio first.',
        );
    if (watches.length > 1)
        throw new Error(
            'Multiple Wear OS emulators are running. Set ANDROID_SERIAL to select one.',
        );
    const selected = watches[0];
    testEnvironment.ANDROID_SERIAL = selected.serial;
    output(
        `Running Wear OS UI tests on ${selected.model} (${selected.serial})...`,
    );
    const watchDirectory = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../wear-os',
    );
    checkedResult(
        run(
            join(watchDirectory, 'gradlew'),
            [
                ':app:connectedDebugAndroidTest',
                '-Pandroid.testInstrumentationRunnerArguments.class=org.driversagainstflock.watch.WatchUiTest',
                '--console=plain',
                ...extraArgs,
            ],
            { cwd: watchDirectory, env: testEnvironment, stdio: 'inherit' },
        ),
        'Wear OS UI tests',
    );
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        testWearEmulator({ extraArgs: process.argv.slice(2) });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
