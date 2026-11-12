import { execFileSync, spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTvPairingUri } from '../components/tv/tv-client.js';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const defaultSdk = join(homedir(), 'Library', 'Android', 'sdk');

export function selectEmulators(devices, tvOverride, phoneOverride) {
    const tv =
        tvOverride ??
        devices.find((device) => /(?:atv|_tv|google_tv)/i.test(device.model))
            ?.serial;
    const phone =
        phoneOverride ??
        devices.find(
            (device) =>
                device.serial !== tv &&
                !/(?:atv|_tv|google_tv)/i.test(device.model),
        )?.serial;
    if (
        !tv ||
        !phone ||
        tv === phone ||
        !devices.some((device) => device.serial === tv) ||
        !devices.some((device) => device.serial === phone)
    ) {
        throw new Error(
            'Start one Android TV emulator and one phone emulator, or set TV_EMULATOR_SERIAL and PHONE_EMULATOR_SERIAL.',
        );
    }
    return { tv, phone };
}

export function parseEmulatorDevices(output) {
    return output
        .split('\n')
        .filter((line) => /^emulator-\d+\s+device\b/.test(line))
        .map((line) => ({
            serial: line.split(/\s+/)[0],
            model: /model:(\S+)/.exec(line)?.[1] ?? '',
        }));
}

export function bridgePairingLink(pairingUri, hostPort) {
    const peer = parseTvPairingUri(pairingUri);
    if (
        !peer ||
        !Number.isInteger(hostPort) ||
        hostPort < 1 ||
        hostPort > 65535
    ) {
        throw new Error(
            'The TV is not showing a valid pairing QR code. Open its pairing screen and retry.',
        );
    }
    const bridged = new URL(pairingUri);
    bridged.searchParams.set('host', '10.0.2.2');
    bridged.searchParams.set('port', String(hostPort));
    const phone = new URL('driversagainstflock://tv-settings');
    for (const [inner, outer] of [
        ['host', 'tvHost'],
        ['port', 'tvPort'],
        ['fingerprint', 'tvFingerprint'],
        ['code', 'tvCode'],
    ])
        phone.searchParams.set(outer, bridged.searchParams.get(inner));
    return {
        phoneLink: phone.toString(),
        tvPort: peer.port,
    };
}

function command(file, args, options = {}) {
    return execFileSync(file, args, {
        timeout: 15_000,
        maxBuffer: 20 * 1024 * 1024,
        ...options,
    });
}

function ensureBridge(adb, tv, port) {
    const mapping = command(adb, ['forward', '--list'], { encoding: 'utf8' })
        .split('\n')
        .find((line) => line.includes(` tcp:${port} `));
    if (mapping && mapping.trim() !== `${tv} tcp:${port} tcp:${port}`) {
        throw new Error(
            `Host port ${port} is already forwarded to another device. Remove that ADB forward before pairing.`,
        );
    }
    if (!mapping)
        command(adb, ['-s', tv, 'forward', `tcp:${port}`, `tcp:${port}`]);
}

function tvShowsPaired(adb, tv) {
    const output = `/sdcard/daf-pair-${Date.now()}.xml`;
    command(adb, ['-s', tv, 'shell', 'uiautomator', 'dump', output], {
        encoding: 'utf8',
    });
    try {
        const hierarchy = command(adb, ['-s', tv, 'shell', 'cat', output], {
            encoding: 'utf8',
        });
        return hierarchy.includes('content-desc="Phone paired"');
    } finally {
        command(adb, ['-s', tv, 'shell', 'rm', output]);
    }
}

function screenshotPairingUri(adb, java, jar, tv, temporary) {
    const screenshot = join(temporary, 'tv.png');
    writeFileSync(
        screenshot,
        command(adb, ['-s', tv, 'exec-out', 'screencap', '-p']),
    );
    const result = spawnSync(
        java,
        [
            '--class-path',
            jar,
            join(scriptDirectory, 'TvPairQr.java'),
            screenshot,
        ],
        { encoding: 'utf8', timeout: 15_000, maxBuffer: 20 * 1024 * 1024 },
    );
    return result.status === 0 ? result.stdout : null;
}

function findZxing() {
    const folder = join(
        homedir(),
        '.gradle',
        'caches',
        'modules-2',
        'files-2.1',
        'com.google.zxing',
        'core',
        '3.5.3',
    );
    if (!existsSync(folder))
        throw new Error(
            'ZXing is missing from the Gradle cache. Sync the Android TV project in Android Studio first.',
        );
    const jar = readdirSync(folder)
        .map((hash) => join(folder, hash, 'core-3.5.3.jar'))
        .find(existsSync);
    if (!jar)
        throw new Error('ZXing core 3.5.3 is missing from the Gradle cache.');
    return jar;
}

async function pair() {
    const sdk =
        process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? defaultSdk;
    const adb = join(sdk, 'platform-tools', 'adb');
    if (!existsSync(adb)) throw new Error(`ADB not found in ${sdk}`);
    const java = process.env.JAVA_HOME
        ? join(process.env.JAVA_HOME, 'bin', 'java')
        : '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java';
    if (!existsSync(java))
        throw new Error('Java not found. Set JAVA_HOME to a JDK.');
    const devices = parseEmulatorDevices(
        command(adb, ['devices', '-l'], { encoding: 'utf8' }),
    );
    const { tv, phone } = selectEmulators(
        devices,
        process.env.TV_EMULATOR_SERIAL,
        process.env.PHONE_EMULATOR_SERIAL,
    );
    const temporary = mkdtempSync(join(tmpdir(), 'daf-tv-pair-'));
    try {
        const jar = findZxing();
        let pairingUri = screenshotPairingUri(adb, java, jar, tv, temporary);
        if (!pairingUri && tvShowsPaired(adb, tv)) {
            ensureBridge(adb, tv, 38477);
            console.log(
                `TV is already paired. Restored ADB bridge 38477 → ${tv}:38477 for syncing.`,
            );
            return;
        }
        if (!pairingUri) {
            command(adb, [
                '-s',
                tv,
                'shell',
                'am',
                'force-stop',
                'com.anonymous.drivefree.dev',
            ]);
            command(adb, [
                '-s',
                tv,
                'shell',
                'am',
                'start',
                '-n',
                'com.anonymous.drivefree.dev/org.driversagainstflock.tv.MainActivity',
            ]);
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
            pairingUri = screenshotPairingUri(adb, java, jar, tv, temporary);
        }
        if (!pairingUri)
            throw new Error(
                'No pairing QR found on the TV. Unpair any existing phone in TV Settings, then retry.',
            );
        const peer = parseTvPairingUri(pairingUri);
        if (!peer)
            throw new Error('The TV QR code has an invalid pairing endpoint.');
        ensureBridge(adb, tv, peer.port);
        const hostPort = peer.port;
        const { phoneLink } = bridgePairingLink(pairingUri, hostPort);
        command(
            adb,
            [
                '-s',
                phone,
                'shell',
                'am',
                'start',
                '-a',
                'android.intent.action.VIEW',
                '-d',
                `'${phoneLink}'`,
                '-p',
                'com.anonymous.drivefree.dev',
            ],
            { encoding: 'utf8' },
        );
        console.log(
            `Opened TV pairing on ${phone}. Waiting for the TV to confirm its first sync…`,
        );
        for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
            if (tvShowsPaired(adb, tv)) {
                console.log(
                    `Phone paired and first Area snapshot received. ADB bridge ${hostPort} → ${tv}:${peer.port} remains active for syncing.`,
                );
                return;
            }
        }
        throw new Error(
            'Pairing did not complete. Keep the phone app open, select its Expo development server if prompted, then rerun this command.',
        );
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
    pair().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
