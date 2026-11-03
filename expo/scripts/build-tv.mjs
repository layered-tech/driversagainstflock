import {
    existsSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadEasVersionClient } from './wear-eas-version.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scriptDirectory, '../..');
const tvDirectory = resolve(repository, 'android-tv');
const expoDirectory = resolve(repository, 'expo');

const signingFields = {
    TV_RELEASE_STORE_FILE: 'keystorePath',
    TV_RELEASE_STORE_PASSWORD: 'keystorePassword',
    TV_RELEASE_KEY_ALIAS: 'keyAlias',
    TV_RELEASE_KEY_PASSWORD: 'keyPassword',
};

export function productionEnvironment(
    environment,
    roots = { repository, expoDirectory },
) {
    const versionName = environment.TV_VERSION_NAME ?? '0.1.0';
    if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(versionName)) {
        throw new Error('TV_VERSION_NAME must be a version such as 0.1.0.');
    }

    const result = { ...environment, TV_VERSION_NAME: versionName };
    const supplied = Object.keys(signingFields).filter((key) =>
        Boolean(environment[key]),
    );
    if (supplied.length > 0 && supplied.length < 4) {
        throw new Error(
            'Supply all four TV_RELEASE_* signing variables together.',
        );
    }
    if (supplied.length === 0) {
        const credentialsFile = resolve(
            roots.expoDirectory,
            'credentials.json',
        );
        if (!existsSync(credentialsFile)) {
            throw new Error(
                'Set all four TV_RELEASE_* signing variables, or provide expo/credentials.json.',
            );
        }
        let keystore;
        try {
            keystore = JSON.parse(readFileSync(credentialsFile, 'utf8'))
                ?.android?.keystore;
        } catch {
            throw new Error('Could not parse expo/credentials.json.');
        }
        for (const [variable, field] of Object.entries(signingFields)) {
            if (typeof keystore?.[field] !== 'string' || !keystore[field]) {
                throw new Error(
                    `expo/credentials.json is missing android.keystore.${field}.`,
                );
            }
            result[variable] = keystore[field];
        }
        result.TV_RELEASE_STORE_FILE = resolve(
            roots.expoDirectory,
            result.TV_RELEASE_STORE_FILE,
        );
    } else if (!isAbsolute(result.TV_RELEASE_STORE_FILE)) {
        result.TV_RELEASE_STORE_FILE = resolve(
            roots.repository,
            result.TV_RELEASE_STORE_FILE,
        );
    }
    if (
        !existsSync(result.TV_RELEASE_STORE_FILE) ||
        !statSync(result.TV_RELEASE_STORE_FILE).isFile()
    ) {
        throw new Error('The TV upload keystore file does not exist.');
    }
    if (result.TV_RELEASE_KEY_ALIAS === 'androiddebugkey') {
        throw new Error(
            'Production TV builds cannot use the Android debug key.',
        );
    }
    return result;
}

export async function withTvVersion(
    directory,
    environment,
    build,
    { checkOnly = false, versionClient } = {},
) {
    const versionFile = resolve(directory, 'version-code.json');
    const lockFile = resolve(directory, '.version-code.lock');
    try {
        writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        throw new Error(
            'Another TV release build holds .version-code.lock. If it crashed, remove that lock after confirming no build is running.',
        );
    }
    try {
        const { lastVersionCode } = JSON.parse(
            readFileSync(versionFile, 'utf8'),
        );
        if (
            !Number.isInteger(lastVersionCode) ||
            lastVersionCode < 0 ||
            lastVersionCode > 2_100_000_000
        ) {
            throw new Error(
                'Invalid lastVersionCode in android-tv/version-code.json.',
            );
        }
        const remote =
            versionClient ??
            loadEasVersionClient(
                resolve(directory, '../expo'),
                environment,
                'production',
            );
        const latest = await remote.latest();
        const previousCode = Math.max(lastVersionCode, latest.code);
        const rawCode = environment.TV_VERSION_CODE ?? String(previousCode + 1);
        const code = Number(rawCode);
        if (
            !/^[1-9][0-9]*$/.test(rawCode) ||
            !Number.isInteger(code) ||
            code <= previousCode ||
            code > 2_100_000_000
        ) {
            throw new Error(
                `TV_VERSION_CODE must be greater than ${previousCode} and at most 2100000000.`,
            );
        }
        console.log(
            `EAS Android versionCode: ${latest.code}; next TV versionCode: ${code}.`,
        );
        if (checkOnly) return 0;
        await remote.reserve(code, latest);
        writeFileSync(
            `${versionFile}.tmp`,
            JSON.stringify({ lastVersionCode: code }, null, 4) + '\n',
        );
        renameSync(`${versionFile}.tmp`, versionFile);
        return await build({ ...environment, TV_VERSION_CODE: String(code) });
    } finally {
        unlinkSync(lockFile);
    }
}

export function commandFor(mode) {
    const task = {
        local: ':app:assembleDebug',
        install: ':app:assembleDebug',
        production: ':app:bundleRelease',
    }[mode];
    if (!task) throw new Error('Use local, install, or production.');
    return [
        resolve(tvDirectory, 'gradlew'),
        '-p',
        tvDirectory,
        task,
        '--console=plain',
    ];
}

function checkedCommand(result, action) {
    if (result.error) throw new Error(`${action}: ${result.error.message}`);
    if (result.status !== 0)
        throw new Error(
            `${action} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}.`,
        );
    return result.stdout ?? '';
}

export function installTvDev({
    environment = process.env,
    execute = spawnSync,
    tvDirectory: selectedTvDirectory = tvDirectory,
    output = console.log,
    checkOnly = false,
} = {}) {
    const buildEnvironment = { ...environment };
    const sdk = [
        environment.ANDROID_HOME,
        environment.ANDROID_SDK_ROOT,
        resolve(environment.HOME ?? homedir(), 'Library/Android/sdk'),
    ].find(
        (candidate) =>
            candidate && existsSync(resolve(candidate, 'platform-tools/adb')),
    );
    const adb = sdk ? resolve(sdk, 'platform-tools/adb') : 'adb';
    if (sdk && !buildEnvironment.ANDROID_HOME)
        buildEnvironment.ANDROID_HOME = sdk;
    const studioJava =
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
    if (!buildEnvironment.JAVA_HOME && existsSync(studioJava))
        buildEnvironment.JAVA_HOME = studioJava;

    const devices = checkedCommand(
        execute(adb, ['devices', '-l'], {
            encoding: 'utf8',
            env: buildEnvironment,
        }),
        'ADB device discovery',
    )
        .split(/\r?\n/)
        .map((line) => {
            const match = line.match(/^(\S+)\s+device(?:\s|$)/);
            return match
                ? {
                      serial: match[1],
                      model:
                          line
                              .match(/\bmodel:([^\s]+)/)?.[1]
                              ?.replaceAll('_', ' ') ?? 'Android TV',
                  }
                : null;
        })
        .filter(Boolean);
    const televisions = devices.filter((device) => {
        if (
            environment.ANDROID_SERIAL &&
            device.serial !== environment.ANDROID_SERIAL
        )
            return false;
        const result = execute(
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
                        'feature:android.hardware.type.television',
                )
        );
    });
    if (televisions.length === 0)
        throw new Error(
            'No connected Android TV device found. Start the TV emulator in Android Studio or set ANDROID_SERIAL to a connected TV device.',
        );
    if (televisions.length > 1)
        throw new Error(
            'Multiple Android TV devices are connected. Set ANDROID_SERIAL to select one.',
        );
    const selected = televisions[0];
    output(`Android TV target: ${selected.model} (${selected.serial}).`);
    if (checkOnly) {
        output('TV dev configuration is valid; no build or install started.');
        return 0;
    }

    checkedCommand(
        execute(
            resolve(selectedTvDirectory, 'gradlew'),
            [
                '-p',
                selectedTvDirectory,
                ':app:assembleDebug',
                '--console=plain',
            ],
            {
                cwd: selectedTvDirectory,
                env: buildEnvironment,
                stdio: 'inherit',
            },
        ),
        'Android TV debug build',
    );
    const apk = resolve(
        selectedTvDirectory,
        'app/build/outputs/apk/debug/app-debug.apk',
    );
    if (!existsSync(apk))
        throw new Error(`Android TV debug APK was not created: ${apk}`);
    checkedCommand(
        execute(adb, ['-s', selected.serial, 'install', '-r', apk], {
            encoding: 'utf8',
            env: buildEnvironment,
        }),
        'Android TV APK installation',
    );
    checkedCommand(
        execute(
            adb,
            [
                '-s',
                selected.serial,
                'shell',
                'am',
                'start',
                '-n',
                'com.anonymous.drivefree.dev/org.driversagainstflock.tv.MainActivity',
            ],
            { encoding: 'utf8', env: buildEnvironment },
        ),
        'Android TV dev app launch',
    );
    output(
        `Installed and launched Android TV dev app on ${selected.model} (${selected.serial}).`,
    );
    return 0;
}

export async function run(mode, options = []) {
    if (options.length === 1 && options[0] === '--help') {
        console.log(
            'local: debug APK; install: build, install, and launch on Android TV; production: signed AAB.',
        );
        console.log(
            'Production reserves the next phone/Wear/TV EAS version code and saves it in android-tv/version-code.json.',
        );
        console.log(
            'Requires EAS login and TV_RELEASE_* signing variables or expo/credentials.json.',
        );
        console.log('Keep phone, Wear OS, and TV release builds sequential.');
        console.log(
            'Optional: TV_VERSION_CODE (higher than the saved code), TV_VERSION_NAME (default 0.1.0). Use --check to preview without building or incrementing.',
        );
        return 0;
    }
    if (
        options.length > 0 &&
        !(options.length === 1 && options[0] === '--check')
    ) {
        throw new Error('Only --check and --help are supported.');
    }
    const command = commandFor(mode);
    const env =
        mode === 'production'
            ? productionEnvironment(process.env)
            : { ...process.env };
    if (mode === 'install')
        return installTvDev({
            environment: env,
            checkOnly: options[0] === '--check',
        });
    const build = (buildEnvironment) => {
        if (options[0] === '--check') {
            console.log(`${mode} configuration is valid; no build started.`);
            return 0;
        }
        const studioJava =
            '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
        const macSdk = resolve(process.env.HOME ?? '', 'Library/Android/sdk');
        if (!buildEnvironment.JAVA_HOME && existsSync(studioJava))
            buildEnvironment.JAVA_HOME = studioJava;
        if (!buildEnvironment.ANDROID_HOME && existsSync(macSdk))
            buildEnvironment.ANDROID_HOME = macSdk;
        const result = spawnSync(command[0], command.slice(1), {
            cwd: repository,
            env: buildEnvironment,
            stdio: 'inherit',
        });
        if (result.error)
            throw new Error(
                `Could not start TV Gradle: ${result.error.message}`,
            );
        return result.status ?? 1;
    };
    return mode === 'production'
        ? withTvVersion(tvDirectory, env, build, {
              checkOnly: options[0] === '--check',
          })
        : build(env);
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        process.exitCode = await run(process.argv[2], process.argv.slice(3));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
