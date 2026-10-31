import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const defaultWatchDirectory = resolve(scriptsDirectory, '../../wear-os');

function sdkDirectory(environment) {
    const candidates = [
        environment.ANDROID_HOME,
        environment.ANDROID_SDK_ROOT,
        join(homedir(), 'Library/Android/sdk'),
        join(homedir(), 'Android/Sdk'),
    ];
    return candidates.find(
        (candidate) =>
            candidate && existsSync(join(candidate, 'platform-tools/adb')),
    );
}

export function parseConnectedEmulators(output) {
    return output
        .split('\n')
        .map((line) => {
            const match = line.match(/^(emulator-\d+)\s+device(?:\s|$)/);
            return match
                ? {
                      serial: match[1],
                      model:
                          line
                              .match(/\bmodel:([^\s]+)/)?.[1]
                              ?.replaceAll('_', ' ') ?? 'Wear OS emulator',
                  }
                : null;
        })
        .filter(Boolean);
}

export function chooseEmulator(emulators, answer) {
    const selection = answer.trim();
    const index = Number(selection);
    if (!/^[1-9]\d*$/.test(selection) || index > emulators.length)
        throw new Error(`Choose a number from 1 to ${emulators.length}.`);
    return emulators[index - 1];
}

async function askEmulator(count) {
    const interface_ = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        return await interface_.question(
            `Install on which Wear OS emulator? [1-${count}]: `,
        );
    } finally {
        interface_.close();
    }
}

function checkedResult(result, action) {
    if (result.error) throw new Error(`${action}: ${result.error.message}`);
    if (result.status !== 0)
        throw new Error(
            `${action} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}.`,
        );
    return result.stdout ?? '';
}

export async function buildAndInstallWearDev({
    environment = process.env,
    run = spawnSync,
    ask = askEmulator,
    watchDirectory = defaultWatchDirectory,
    output = console.log,
} = {}) {
    const sdk = sdkDirectory(environment);
    const adb = sdk ? join(sdk, 'platform-tools/adb') : 'adb';
    const buildEnvironment = { ...environment };
    buildEnvironment.WEAR_BUILD_ENV = 'development';
    if (sdk && !buildEnvironment.ANDROID_HOME)
        buildEnvironment.ANDROID_HOME = sdk;
    const studioJdk =
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
    if (!buildEnvironment.JAVA_HOME && existsSync(studioJdk))
        buildEnvironment.JAVA_HOME = studioJdk;

    const devices = parseConnectedEmulators(
        checkedResult(
            run(adb, ['devices', '-l'], {
                encoding: 'utf8',
                env: buildEnvironment,
            }),
            'ADB device discovery',
        ),
    );
    const emulators = devices.filter((device) => {
        const result = run(
            adb,
            ['-s', device.serial, 'shell', 'pm', 'list', 'features'],
            {
                encoding: 'utf8',
                env: buildEnvironment,
            },
        );
        return (
            result.status === 0 &&
            result.stdout
                ?.split(/\r?\n/)
                .some(
                    (feature) =>
                        feature.trim() ===
                        'feature:android.hardware.type.watch',
                )
        );
    });
    if (!emulators.length)
        throw new Error(
            'No running Wear OS emulator found. Start one in Android Studio first.',
        );

    output('Running Wear OS emulators:');
    emulators.forEach((device, index) =>
        output(`  ${index + 1}. ${device.model} (${device.serial})`),
    );
    const selected = chooseEmulator(emulators, await ask(emulators.length));
    output(`Building the Wear OS debug APK for ${selected.serial}...`);
    checkedResult(
        run(
            join(watchDirectory, 'gradlew'),
            [':app:assembleDebug', '--console=plain'],
            {
                cwd: watchDirectory,
                env: buildEnvironment,
                stdio: 'inherit',
            },
        ),
        'Wear OS debug build',
    );

    const apk = join(
        watchDirectory,
        'app/build/outputs/apk/debug/app-debug.apk',
    );
    if (!existsSync(apk))
        throw new Error(`Wear OS debug APK was not created: ${apk}`);
    checkedResult(
        run(adb, ['-s', selected.serial, 'install', '-r', apk], {
            encoding: 'utf8',
            env: buildEnvironment,
        }),
        'Wear OS APK installation',
    );
    checkedResult(
        run(
            adb,
            [
                '-s',
                selected.serial,
                'shell',
                'am',
                'start',
                '-n',
                'com.anonymous.drivefree.dev/org.driversagainstflock.watch.MainActivity',
            ],
            { encoding: 'utf8', env: buildEnvironment },
        ),
        'Wear OS dev app launch',
    );
    output(
        `Installed and launched Dev | DAF on ${selected.model} (${selected.serial}).`,
    );
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    buildAndInstallWearDev().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
