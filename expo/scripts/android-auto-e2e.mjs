#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    appendFileSync,
    createWriteStream,
    existsSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const EXPO_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_SUITE = join(EXPO_DIRECTORY, '.android-auto', 'suite.json');
const DEFAULT_ARTIFACTS =
    '/Volumes/PfeiferDev/DevCaches/chris/expo-builds/android-auto-e2e';
const ANDROID_AUTO_SETTINGS =
    'com.google.android.projection.gearhead/.companion.settings.DefaultSettingsActivity';
const UI_DUMP_PATH = '/sdcard/android-auto-e2e-ui.xml';
const SESSION_WAKE_LOCK = 'AutoPlay:AndroidAutoSession';
const HEAD_UNIT_PORT = 5277;
const DEVELOPMENT_CLIENT_LAUNCH_TIMEOUTS = [45000, 120000];
export const DEFAULT_MAP_CROP = Object.freeze({
    height: 220,
    width: 280,
    x: 430,
    y: 220,
});
export const MINIMUM_MAP_THEME_LUMINANCE_DIFFERENCE = 0.15;
export const MINIMUM_VISIBLE_MAP_CROP_LUMINANCE = 0.01;

const delay = (milliseconds) =>
    new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export function normalizeOCRText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function decodeXML(value) {
    return String(value ?? '')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}

export function findNodeBounds(xml, label) {
    for (const match of String(xml ?? '').matchAll(/<node\b[^>]*>/g)) {
        const attributes = Object.fromEntries(
            [...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(
                ([, key, value]) => [key, decodeXML(value)],
            ),
        );

        if (attributes.text !== label && attributes['content-desc'] !== label) {
            continue;
        }

        const bounds = attributes.bounds?.match(
            /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/,
        );

        if (!bounds) {
            return null;
        }

        const [, left, top, right, bottom] = bounds.map(Number);

        return {
            bottom,
            centerX: Math.round((left + right) / 2),
            centerY: Math.round((top + bottom) / 2),
            left,
            right,
            top,
        };
    }

    return null;
}

export function currentAutoPlayWakeLockIsHeld(powerDump) {
    return new RegExp(
        `^\\s+PARTIAL_WAKE_LOCK\\s+.*'${SESSION_WAKE_LOCK}'`,
        'm',
    ).test(String(powerDump ?? ''));
}

export function childProcessIsRunning(child) {
    return Boolean(
        child && child.exitCode === null && child.signalCode === null,
    );
}

export function tcpDumpHasListeningPort(tcpDump, port) {
    const hexadecimalPort = Number(port)
        .toString(16)
        .padStart(4, '0')
        .toUpperCase();

    return String(tcpDump ?? '')
        .split('\n')
        .some((line) => {
            const fields = line.trim().split(/\s+/);
            const localAddress = fields[1]?.toUpperCase();
            const state = fields[3]?.toUpperCase();

            return (
                localAddress?.endsWith(`:${hexadecimalPort}`) && state === '0A'
            );
        });
}

export function builtInDisplayHasState(displayDump, state) {
    const expectedState = String(state ?? '').toUpperCase();

    if (!expectedState) {
        return false;
    }

    return String(displayDump ?? '')
        .split('\n')
        .some(
            (line) =>
                line.includes('DisplayDeviceInfo{') &&
                line.includes('type INTERNAL') &&
                new RegExp(`\\bstate ${expectedState}\\b`).test(line),
        );
}

export function parseAdbForwardList(value) {
    return String(value ?? '')
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields.length === 3)
        .map(([serial, local, remote]) => ({ local, remote, serial }));
}

export function envFileHasNonEmptyValue(contents, key) {
    for (const line of String(contents ?? '').split('\n')) {
        const match = line.match(
            /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
        );

        if (!match || match[1] !== key) {
            continue;
        }

        const value = match[2].trim();

        return Boolean(value && value !== "''" && value !== '""');
    }

    return false;
}

export function getOCRAssertionFailure(
    ocr,
    { contains = [], notContains = [] } = {},
) {
    const recognized = normalizeOCRText(ocr);

    for (const text of contains) {
        if (!recognized.includes(normalizeOCRText(text))) {
            return `Missing "${text}"`;
        }
    }

    for (const text of notContains) {
        if (recognized.includes(normalizeOCRText(text))) {
            return `Unexpected "${text}"`;
        }
    }

    return null;
}

export function getMapThemeContrastAssertionFailure(
    dayLuminance,
    nightLuminance,
    minimumDifference = MINIMUM_MAP_THEME_LUMINANCE_DIFFERENCE,
) {
    const difference = dayLuminance - nightLuminance;

    if (difference + Number.EPSILON >= minimumDifference) {
        return null;
    }

    return `Expected day map crop to be at least ${minimumDifference.toFixed(4)} lighter than night; received day=${dayLuminance.toFixed(4)}, night=${nightLuminance.toFixed(4)}, difference=${difference.toFixed(4)}`;
}

export function getMapSurfaceVisibilityAssertionFailure(
    luminance,
    minimumLuminance = MINIMUM_VISIBLE_MAP_CROP_LUMINANCE,
) {
    if (luminance + Number.EPSILON >= minimumLuminance) {
        return null;
    }

    return `Expected the map crop to be visible; received mean luminance=${luminance.toFixed(4)}`;
}

function commandText(command, args) {
    return [command, ...args]
        .map((value) =>
            /\s/.test(String(value))
                ? JSON.stringify(String(value))
                : String(value),
        )
        .join(' ');
}

function detectAndroidSdkRoot(environment) {
    if (environment.ANDROID_HOME) {
        return environment.ANDROID_HOME;
    }

    const whichAdb = spawnSync('which', ['adb'], { encoding: 'utf8' });

    if (whichAdb.status !== 0) {
        throw new Error('adb is not available on PATH.');
    }

    return resolve(dirname(whichAdb.stdout.trim()), '..');
}

function detectDevice(environment) {
    const result = spawnSync('adb', ['devices'], { encoding: 'utf8' });

    if (result.status !== 0) {
        throw new Error('Could not list Android devices.');
    }

    const devices = result.stdout
        .split('\n')
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter(([, state]) => state === 'device')
        .map(([serial]) => serial);
    const requested =
        environment.ANDROID_AUTO_E2E_DEVICE || environment.ANDROID_SERIAL;

    if (requested) {
        if (!devices.includes(requested)) {
            throw new Error(`Android device is not connected: ${requested}`);
        }

        return requested;
    }

    const emulators = devices.filter((serial) =>
        serial.startsWith('emulator-'),
    );

    if (emulators.length !== 1) {
        throw new Error(
            `Expected one running emulator; found ${emulators.length}. Set ANDROID_AUTO_E2E_DEVICE to choose one.`,
        );
    }

    return emulators[0];
}

export class Runner {
    constructor(suitePath, environment = process.env) {
        this.environment = environment;
        this.suitePath = resolve(suitePath);
        this.suite = JSON.parse(readFileSync(this.suitePath, 'utf8'));
        this.serial = detectDevice(environment);
        this.androidSdkRoot = detectAndroidSdkRoot(environment);
        this.dhuBinary = resolve(
            environment.ANDROID_AUTO_E2E_DHU_BINARY ||
                join(
                    this.androidSdkRoot,
                    'extras',
                    'google',
                    'auto',
                    'desktop-head-unit',
                ),
        );
        this.dhuConfig = resolve(
            environment.ANDROID_AUTO_E2E_DHU_CONFIG ||
                join(EXPO_DIRECTORY, 'config', 'android-auto-dhu.ini'),
        );
        this.artifactsRoot = resolve(
            environment.ANDROID_AUTO_E2E_ARTIFACTS_DIR || DEFAULT_ARTIFACTS,
        );
        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .replace('Z', '');
        this.runDirectory = join(this.artifactsRoot, timestamp);
        mkdirSync(this.runDirectory, { recursive: true });
        this.harnessLog = join(this.runDirectory, 'harness.log');
        this.metroOutput = '';
        this.dhuOutput = '';
        this.metroProcess = null;
        this.dhuProcess = null;
        this.metroProcessError = null;
        this.dhuProcessError = null;
        this.startedServer = false;
        this.ownsForward = false;
        this.startedApp = false;
        this.preparedDevice = false;
        this.phoneSleeping = false;
        this.cleanupPromise = null;
        this.screenshots = new Map();
        this.screenshotNumber = 0;
        this.ocrBinary = join(this.runDirectory, 'android-auto-ocr');
    }

    report(message) {
        console.log(message);
        appendFileSync(
            this.harnessLog,
            `${new Date().toISOString()} ${message}\n`,
        );
    }

    run(command, args, options = {}) {
        const result = spawnSync(command, args, {
            cwd: options.cwd || EXPO_DIRECTORY,
            encoding: 'utf8',
            env: options.env || this.environment,
            maxBuffer: 24 * 1024 * 1024,
            timeout: options.timeout ?? 30000,
        });
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
        appendFileSync(
            this.harnessLog,
            `$ ${commandText(command, args)}\n${options.logOutput === false ? '' : output}`,
        );

        if (!options.allowFailure && (result.error || result.status !== 0)) {
            throw new Error(
                `${commandText(command, args)} failed${output.trim() ? `: ${output.trim()}` : ''}`,
            );
        }

        return result;
    }

    adb(args, options = {}) {
        return this.run('adb', ['-s', this.serial, ...args], options);
    }

    async waitFor(predicate, description, timeout = 30000) {
        const deadline = Date.now() + timeout;
        let lastError;

        while (Date.now() < deadline) {
            try {
                if (await predicate()) {
                    return;
                }
            } catch (error) {
                lastError = error;
            }

            await delay(300);
        }

        throw new Error(
            `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`,
        );
    }

    async portIsOpen(port) {
        return new Promise((resolvePort) => {
            const socket = net.createConnection({
                host: '127.0.0.1',
                port,
            });
            const done = (open) => {
                socket.destroy();
                resolvePort(open);
            };

            socket.setTimeout(300);
            socket.once('connect', () => done(true));
            socket.once('error', () => done(false));
            socket.once('timeout', () => done(false));
        });
    }

    captureProcess(child, filename, outputKey, errorKey) {
        const stream = createWriteStream(join(this.runDirectory, filename));
        const capture = (chunk) => {
            const value = chunk.toString();
            stream.write(value);
            this[outputKey] += value;
        };

        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
        child.once('error', (error) => {
            this[errorKey] = error;
            const message = `Process error: ${error.message}\n`;
            stream.write(message);
            this[outputKey] += message;
        });
        child.once('close', () => stream.end());
    }

    validate() {
        const envFile = join(EXPO_DIRECTORY, '.env.development.local');

        for (const [label, path] of [
            ['suite', this.suitePath],
            ['development env', envFile],
            ['DHU binary', this.dhuBinary],
            ['DHU config', this.dhuConfig],
            ['OCR source', join(SCRIPT_DIRECTORY, 'android-auto-ocr.swift')],
        ]) {
            if (!existsSync(path)) {
                throw new Error(`Missing ${label}: ${path}`);
            }
        }

        if (statSync(envFile).size === 0) {
            throw new Error(`Development env is empty: ${envFile}`);
        }

        if (
            !envFileHasNonEmptyValue(
                readFileSync(envFile, 'utf8'),
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            )
        ) {
            throw new Error(
                `Development env does not define EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: ${envFile}`,
            );
        }

        if (/\s/.test(this.runDirectory)) {
            throw new Error(
                `DHU screenshot paths cannot contain spaces: ${this.runDirectory}`,
            );
        }

        const resolution = readFileSync(this.dhuConfig, 'utf8').match(
            /^resolution\s*=\s*(\d+)x(\d+)/m,
        );

        if (
            Number(resolution?.[1]) !== this.suite.display.width ||
            Number(resolution?.[2]) !== this.suite.display.height
        ) {
            throw new Error(
                `Suite requires DHU ${this.suite.display.width}x${this.suite.display.height}.`,
            );
        }

        this.run('xcrun', ['--find', 'swiftc']);
        this.report(`Device: ${this.serial}`);
        this.report(`Artifacts: ${this.runDirectory}`);
        this.report(`Mapbox environment file is present: ${envFile}`);
    }

    compileOCR() {
        const moduleCache = join(this.runDirectory, 'swift-module-cache');
        mkdirSync(moduleCache, { recursive: true });
        this.run(
            'xcrun',
            [
                'swiftc',
                '-module-cache-path',
                moduleCache,
                '-O',
                join(SCRIPT_DIRECTORY, 'android-auto-ocr.swift'),
                '-o',
                this.ocrBinary,
            ],
            { timeout: 120000 },
        );
    }

    existingDhuPids() {
        const result = spawnSync('ps', ['-axo', 'pid=,command='], {
            encoding: 'utf8',
        });

        if (result.status !== 0) {
            return [];
        }

        const paths = [this.dhuBinary, realpathSync(this.dhuBinary)];

        return result.stdout
            .split('\n')
            .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
            .filter(Boolean)
            .filter(([, , command]) =>
                paths.some((path) => command.startsWith(path)),
            )
            .map(([, pid]) => Number(pid));
    }

    async stopExistingDhu() {
        const pids = this.existingDhuPids();

        if (!pids.length) {
            return;
        }

        this.report(`Stopping existing DHU: ${pids.join(', ')}`);

        for (const pid of pids) {
            try {
                process.kill(pid, 'SIGTERM');
            } catch {}
        }

        await this.waitFor(
            () => this.existingDhuPids().length === 0,
            'existing DHU to stop',
            10000,
        );
    }

    async startMetro() {
        const { port } = this.suite.metro;

        if (await this.portIsOpen(port)) {
            throw new Error(`Dedicated Metro port ${port} is already in use.`);
        }

        this.report(`Starting managed Metro on ${port}`);
        this.metroProcessError = null;
        this.metroProcess = spawn(
            'npx',
            [
                'expo',
                'start',
                '--dev-client',
                '--offline',
                '--port',
                String(port),
            ],
            {
                cwd: EXPO_DIRECTORY,
                detached: true,
                env: {
                    ...this.environment,
                    APP_ENV: 'e2e',
                    CI: '1',
                    EXPO_PUBLIC_E2E_MAP_API_MOCKS: '1',
                    FORCE_COLOR: '0',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        this.captureProcess(
            this.metroProcess,
            'metro.log',
            'metroOutput',
            'metroProcessError',
        );
        await this.waitFor(
            async () => {
                if (this.metroProcessError) {
                    throw this.metroProcessError;
                }

                return (
                    childProcessIsRunning(this.metroProcess) &&
                    (await this.portIsOpen(port))
                );
            },
            `Metro port ${port}`,
            60000,
        );
    }

    prepareDevice() {
        this.preparedDevice = true;
        this.adb(['logcat', '-c']);
        this.adb(['shell', 'pm', 'clear', this.suite.appId]);

        for (const permission of [
            'android.permission.ACCESS_COARSE_LOCATION',
            'android.permission.ACCESS_FINE_LOCATION',
            'android.permission.POST_NOTIFICATIONS',
        ]) {
            this.adb(['shell', 'pm', 'grant', this.suite.appId, permission], {
                allowFailure: true,
            });
        }

        this.adb([
            'emu',
            'geo',
            'fix',
            String(this.suite.location.longitude),
            String(this.suite.location.latitude),
        ]);
        this.adb(['shell', 'am', 'force-stop', this.suite.appId]);
    }

    serverIsListening() {
        const result = this.adb(
            ['shell', 'cat', '/proc/net/tcp', '/proc/net/tcp6'],
            { logOutput: false },
        );

        return tcpDumpHasListeningPort(result.stdout, HEAD_UNIT_PORT);
    }

    forwardForHeadUnitPort() {
        const result = this.adb(['forward', '--list'], {
            logOutput: false,
        });

        return parseAdbForwardList(result.stdout).find(
            ({ local }) => local === `tcp:${HEAD_UNIT_PORT}`,
        );
    }

    ensureHeadUnitForward() {
        const existing = this.forwardForHeadUnitPort();

        if (existing) {
            if (
                existing.serial !== this.serial ||
                existing.remote !== `tcp:${HEAD_UNIT_PORT}`
            ) {
                throw new Error(
                    `Host TCP ${HEAD_UNIT_PORT} is already forwarded by ${existing.serial} to ${existing.remote}.`,
                );
            }

            this.report(
                `Preserving existing ADB forward for TCP ${HEAD_UNIT_PORT}`,
            );
            return;
        }

        this.adb(['forward', `tcp:${HEAD_UNIT_PORT}`, `tcp:${HEAD_UNIT_PORT}`]);
        this.ownsForward = true;
    }

    dumpUi() {
        this.adb(['shell', 'uiautomator', 'dump', UI_DUMP_PATH], {
            logOutput: false,
        });

        return this.adb(['exec-out', 'cat', UI_DUMP_PATH], {
            logOutput: false,
        }).stdout;
    }

    tapPhoneNode(xml, label) {
        const bounds = findNodeBounds(xml, label);

        if (!bounds) {
            throw new Error(`Android Auto menu item is not visible: ${label}`);
        }

        this.adb([
            'shell',
            'input',
            'tap',
            String(bounds.centerX),
            String(bounds.centerY),
        ]);
    }

    async openServerMenu() {
        this.adb([
            'shell',
            'am',
            'start',
            '--display',
            '0',
            '-W',
            '-n',
            ANDROID_AUTO_SETTINGS,
        ]);
        await delay(800);
        let xml = this.dumpUi();

        if (
            findNodeBounds(xml, 'Start head unit server') ||
            findNodeBounds(xml, 'Stop head unit server')
        ) {
            return xml;
        }

        this.tapPhoneNode(xml, 'More options');
        await delay(600);
        xml = this.dumpUi();

        if (
            !findNodeBounds(xml, 'Start head unit server') &&
            !findNodeBounds(xml, 'Stop head unit server')
        ) {
            throw new Error(
                'Head-unit server control is missing from Android Auto overflow.',
            );
        }

        return xml;
    }

    async startServer() {
        if (this.serverIsListening()) {
            this.report('Preserving existing Android Auto head-unit server');
        } else {
            const xml = await this.openServerMenu();
            this.tapPhoneNode(xml, 'Start head unit server');
            this.startedServer = true;
            await this.waitFor(
                () => this.serverIsListening(),
                'Android Auto head-unit server',
                15000,
            );
        }

        this.ensureHeadUnitForward();
    }

    powerDump() {
        return this.adb(['shell', 'dumpsys', 'power'], {
            logOutput: false,
        }).stdout;
    }

    displayDump() {
        return this.adb(['shell', 'dumpsys', 'display'], {
            logOutput: false,
        }).stdout;
    }

    wakeLockHeld() {
        return currentAutoPlayWakeLockIsHeld(this.powerDump());
    }

    serviceRunning() {
        const result = this.adb(
            [
                'shell',
                'dumpsys',
                'activity',
                'service',
                this.suite.serviceComponent,
            ],
            { logOutput: false },
        );

        return result.stdout.includes(`SERVICE ${this.suite.serviceComponent}`);
    }

    async startDhu() {
        this.report(`Starting managed DHU with ${this.dhuConfig}`);
        this.dhuProcessError = null;
        this.dhuProcess = spawn(this.dhuBinary, ['-c', this.dhuConfig], {
            cwd: EXPO_DIRECTORY,
            env: this.environment,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.captureProcess(
            this.dhuProcess,
            'dhu.log',
            'dhuOutput',
            'dhuProcessError',
        );
        this.dhuProcess.stdin.once('error', (error) => {
            this.dhuProcessError = error;
        });
        await this.waitFor(
            () => {
                if (this.dhuProcessError) {
                    throw this.dhuProcessError;
                }

                return (
                    childProcessIsRunning(this.dhuProcess) &&
                    this.serviceRunning() &&
                    this.wakeLockHeld()
                );
            },
            'Android Auto service and session wake lock',
            45000,
        );
    }

    restartAppWithDevelopmentClient(attempt) {
        const { host, port } = this.suite.metro;
        const url = `exp+driversagainstflock://expo-development-client/?url=http%3A%2F%2F${host}%3A${port}`;
        this.report(
            `Launching development client (attempt ${attempt}/${DEVELOPMENT_CLIENT_LAUNCH_TIMEOUTS.length})`,
        );
        this.adb(['shell', 'am', 'force-stop', this.suite.appId]);
        const outputStart = this.metroOutput.length;
        this.adb([
            'shell',
            'am',
            'start',
            '-W',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            url,
            this.suite.appId,
        ]);
        this.startedApp = true;

        return outputStart;
    }

    async waitForDevelopmentClient(outputStart, bundleTimeout) {
        await this.waitForMetroMarker(
            'Android Bundled',
            outputStart,
            bundleTimeout,
        );
    }

    async waitForCarAppReady(outputStart) {
        await this.waitFor(
            () => {
                if (this.dhuProcessError) {
                    throw this.dhuProcessError;
                }

                if (!childProcessIsRunning(this.dhuProcess)) {
                    throw new Error('Managed DHU stopped unexpectedly.');
                }

                return this.serviceRunning() && this.wakeLockHeld();
            },
            'Android Auto service and session wake lock after DHU connects',
            45000,
        );
        await this.waitForMetroMarker(
            'Running "AutoPlayRoot"',
            outputStart,
            60000,
        );
        await this.waitForMetroMarker(
            '[Android Auto] map-loaded',
            outputStart,
            60000,
        );
    }

    async launchApp() {
        const errors = [];

        for (
            let index = 0;
            index < DEVELOPMENT_CLIENT_LAUNCH_TIMEOUTS.length;
            index += 1
        ) {
            const attempt = index + 1;
            const outputStart = this.restartAppWithDevelopmentClient(attempt);

            try {
                await this.waitForDevelopmentClient(
                    outputStart,
                    DEVELOPMENT_CLIENT_LAUNCH_TIMEOUTS[index],
                );
                return outputStart;
            } catch (error) {
                errors.push(error);

                if (
                    this.metroProcessError ||
                    !childProcessIsRunning(this.metroProcess) ||
                    this.dhuProcessError ||
                    (this.dhuProcess && !childProcessIsRunning(this.dhuProcess))
                ) {
                    throw error;
                }

                if (attempt < DEVELOPMENT_CLIENT_LAUNCH_TIMEOUTS.length) {
                    this.report(
                        `Development-client launch attempt ${attempt} failed; retrying: ${error.message}`,
                    );
                }
            }
        }

        throw new AggregateError(
            errors,
            `Development client did not become ready after ${DEVELOPMENT_CLIENT_LAUNCH_TIMEOUTS.length} attempts: ${errors.map((error) => error.message).join('; ')}`,
        );
    }

    async waitForMetroMarker(marker, outputStart, timeout = 30000) {
        await this.waitFor(
            () => {
                if (this.metroProcessError) {
                    throw this.metroProcessError;
                }

                if (!childProcessIsRunning(this.metroProcess)) {
                    throw new Error('Managed Metro stopped unexpectedly.');
                }

                return this.metroOutput.slice(outputStart).includes(marker);
            },
            `Metro marker ${marker}`,
            timeout,
        );
    }

    sendDhu(command) {
        if (
            !childProcessIsRunning(this.dhuProcess) ||
            this.dhuProcessError ||
            this.dhuProcess.stdin.destroyed ||
            this.dhuProcess.stdin.writableEnded
        ) {
            throw new Error(`DHU is not running: ${command}`);
        }

        appendFileSync(this.harnessLog, `DHU> ${command}\n`);
        this.dhuProcess.stdin.write(`${command}\n`);
    }

    async captureScreenshot(name) {
        this.screenshotNumber += 1;
        const prefix = String(this.screenshotNumber).padStart(2, '0');
        const imagePath = join(this.runDirectory, `${prefix}-${name}.png`);
        this.sendDhu(`screenshot ${imagePath}`);
        let previousSize = -1;
        let stableSizeSamples = 0;
        await this.waitFor(
            () => {
                if (!existsSync(imagePath)) {
                    return false;
                }

                const currentSize = statSync(imagePath).size;

                if (currentSize <= 1000) {
                    previousSize = currentSize;
                    stableSizeSamples = 0;
                    return false;
                }

                stableSizeSamples =
                    currentSize === previousSize ? stableSizeSamples + 1 : 0;
                previousSize = currentSize;

                return stableSizeSamples >= 2;
            },
            `screenshot ${name}`,
            20000,
        );
        let ocrResult;
        await this.waitFor(
            () => {
                const result = this.run(this.ocrBinary, [imagePath], {
                    allowFailure: true,
                    timeout: 10000,
                });

                if (result.error || result.status !== 0) {
                    return false;
                }

                ocrResult = result;
                return true;
            },
            `decodable screenshot ${name}`,
            60000,
        );
        const ocr = ocrResult.stdout.trim();
        writeFileSync(
            join(this.runDirectory, `${prefix}-${name}.ocr.txt`),
            `${ocr}\n`,
        );
        const screenshot = {
            hash: createHash('sha256')
                .update(readFileSync(imagePath))
                .digest('hex'),
            imagePath,
            ocr,
        };
        this.screenshots.set(name, screenshot);

        return screenshot;
    }

    async dispatchDeepLink(requestType, query) {
        const outputStart = this.metroOutput.length;
        const url = `driversagainstflock://e2e-mocks?autoPlayRequestType=${encodeURIComponent(requestType)}&query=${encodeURIComponent(query)}`;
        const remote = `am start -a android.intent.action.VIEW -d "${url}" ${this.suite.appId}`;
        this.adb(['shell', remote]);
        const marker =
            requestType === 'search'
                ? '[Android Auto] place-search-completed'
                : requestType === 'directions'
                  ? '[Android Auto] route-choices-presented'
                  : '[Android Auto] navigation-start-requested';
        await this.waitForMetroMarker(marker, outputStart, 60000);

        if (requestType === 'directions') {
            await this.waitFor(
                () =>
                    /["']?routeChoiceCount["']?\s*:\s*2\b/.test(
                        this.metroOutput.slice(outputStart),
                    ),
                'two Android Auto route choices',
                10000,
            );
        }
    }

    async assertOcr(
        name,
        { contains = [], notContains = [], timeout = 20000 } = {},
    ) {
        let screenshot = this.screenshots.get(name);

        if (!screenshot) {
            throw new Error(`Screenshot was not captured: ${name}`);
        }

        const deadline = Date.now() + timeout;
        let failure;

        while (true) {
            failure = getOCRAssertionFailure(screenshot.ocr, {
                contains,
                notContains,
            });

            if (!failure) {
                return;
            }

            if (Date.now() >= deadline) {
                throw new Error(
                    `${failure} in ${screenshot.imagePath}. OCR:\n${screenshot.ocr}`,
                );
            }

            await delay(1000);
            screenshot = await this.captureScreenshot(name);
        }
    }

    mapCropMeanLuminance(name) {
        const screenshot = this.screenshots.get(name);

        if (!screenshot) {
            throw new Error(`Screenshot was not captured: ${name}`);
        }

        const { height, width, x, y } = DEFAULT_MAP_CROP;
        const result = this.run(this.ocrBinary, [
            '--mean-luminance',
            screenshot.imagePath,
            String(x),
            String(y),
            String(width),
            String(height),
        ]);
        const luminance = Number(result.stdout.trim());

        if (!Number.isFinite(luminance) || luminance < 0 || luminance > 1) {
            throw new Error(
                `Invalid map crop luminance for ${name}: ${result.stdout.trim()}`,
            );
        }

        return luminance;
    }

    async ensureMapCropIsVisible(
        name,
        { retryDelayMilliseconds = 1000, timeout = 20000 } = {},
    ) {
        const deadline = Date.now() + timeout;

        while (true) {
            const luminance = this.mapCropMeanLuminance(name);
            const failure = getMapSurfaceVisibilityAssertionFailure(luminance);
            this.report(`Map crop visibility ${name}=${luminance.toFixed(4)}`);

            if (!failure) {
                return luminance;
            }

            if (Date.now() >= deadline) {
                throw new Error(failure);
            }

            await delay(retryDelayMilliseconds);
            await this.captureScreenshot(name);
        }
    }

    async assertMapThemeContrast(
        dayName,
        nightName,
        { recapture, retryDelayMilliseconds = 1000, timeout = 20000 } = {},
    ) {
        const deadline = Date.now() + timeout;

        while (true) {
            const dayLuminance = this.mapCropMeanLuminance(dayName);
            const nightLuminance = this.mapCropMeanLuminance(nightName);
            const invisibleCrop = [
                [dayName, dayLuminance],
                [nightName, nightLuminance],
            ].find(([, luminance]) =>
                getMapSurfaceVisibilityAssertionFailure(luminance),
            );

            if (invisibleCrop) {
                const [name, luminance] = invisibleCrop;
                const failure =
                    getMapSurfaceVisibilityAssertionFailure(luminance);

                if (recapture !== name || Date.now() >= deadline) {
                    throw new Error(failure);
                }

                await this.ensureMapCropIsVisible(name, {
                    retryDelayMilliseconds,
                    timeout: Math.max(0, deadline - Date.now()),
                });
                continue;
            }

            const difference = dayLuminance - nightLuminance;
            this.report(
                `Map theme contrast ${dayName}=${dayLuminance.toFixed(4)} ${nightName}=${nightLuminance.toFixed(4)} difference=${difference.toFixed(4)}`,
            );
            const failure = getMapThemeContrastAssertionFailure(
                dayLuminance,
                nightLuminance,
            );

            if (!failure) {
                return;
            }

            if (!recapture || Date.now() >= deadline) {
                throw new Error(failure);
            }

            await delay(retryDelayMilliseconds);
            await this.captureScreenshot(recapture);
        }
    }

    async wakePhone() {
        this.adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
        this.adb(['shell', 'wm', 'dismiss-keyguard'], { allowFailure: true });
        await this.waitFor(
            () => builtInDisplayHasState(this.displayDump(), 'ON'),
            'built-in phone display to turn on',
            10000,
        );
        this.phoneSleeping = false;
    }

    async runStep(step) {
        switch (step.type) {
            case 'dhu': {
                const outputStart = this.metroOutput.length;
                this.sendDhu(step.command);

                if (step.waitForMetro) {
                    await this.waitForMetroMarker(
                        step.waitForMetro,
                        outputStart,
                        step.timeout,
                    );
                }
                break;
            }
            case 'sleep':
                await delay(step.milliseconds);
                break;
            case 'screenshot':
                await this.captureScreenshot(step.name);

                if (step.requireVisibleMapCrop) {
                    await this.ensureMapCropIsVisible(step.name, step);
                }
                break;
            case 'assertOcr':
                await this.assertOcr(step.screenshot, step);
                break;
            case 'assertImagesDiffer': {
                const first = this.screenshots.get(step.first);
                const second = this.screenshots.get(step.second);

                if (!first || !second || first.hash === second.hash) {
                    throw new Error(
                        `Expected screenshots to differ: ${step.first}, ${step.second}`,
                    );
                }
                break;
            }
            case 'assertMapThemeContrast':
                await this.assertMapThemeContrast(step.day, step.night, step);
                break;
            case 'assertService':
                await this.waitFor(
                    () => this.serviceRunning() === step.running,
                    `Android Auto service running=${step.running}`,
                    15000,
                );
                break;
            case 'assertWakeLock':
                await this.waitFor(
                    () => this.wakeLockHeld() === step.held,
                    `Android Auto wake lock held=${step.held}`,
                    15000,
                );
                break;
            case 'deepLink':
                await this.dispatchDeepLink(step.requestType, step.query);
                break;
            case 'autoDrive': {
                const outputStart = this.metroOutput.length;
                this.adb([
                    'shell',
                    'dumpsys',
                    'activity',
                    'service',
                    this.suite.serviceComponent,
                    'AUTO_DRIVE',
                ]);

                if (step.waitForMetro) {
                    await this.waitForMetroMarker(
                        step.waitForMetro,
                        outputStart,
                        step.timeout,
                    );
                }
                break;
            }
            case 'phoneSleep':
                this.adb(['shell', 'input', 'keyevent', 'KEYCODE_SLEEP']);
                this.phoneSleeping = true;
                await this.waitFor(
                    () => builtInDisplayHasState(this.displayDump(), 'OFF'),
                    'built-in phone display to turn off',
                    10000,
                );
                break;
            case 'phoneWake':
                await this.wakePhone();
                break;
            case 'disconnect':
                await this.stopDhu();
                break;
            default:
                throw new Error(`Unknown Android Auto E2E step: ${step.type}`);
        }
    }

    async runSuite() {
        this.sendDhu(
            'keycode back; sleep 1; keycode navigation; sleep 2; dpad click; sleep 3',
        );
        await delay(7000);

        for (const [index, test] of this.suite.tests.entries()) {
            this.report(
                `[${index + 1}/${this.suite.tests.length}] ${test.name}`,
            );

            for (const step of test.steps) {
                await this.runStep(step);
            }

            this.report(`PASS ${test.name}`);
        }
    }

    captureLogcat({ allowFailure = false } = {}) {
        const result = this.adb(['logcat', '-d', '-v', 'threadtime'], {
            allowFailure,
        });
        const logcat = result.stdout ?? '';
        const failure =
            result.error || result.status !== 0
                ? `\n[logcat capture failed: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}]\n`
                : '';
        writeFileSync(
            join(this.runDirectory, 'android-logcat.txt'),
            `${logcat}${failure}`,
        );

        return logcat;
    }

    assertNoFatalCrash() {
        const logcat = this.captureLogcat();
        const escaped = this.suite.appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const appOrService = `(?:${escaped}|AndroidAutoService)`;
        const crashPatterns = [
            new RegExp(`FATAL EXCEPTION[\\s\\S]{0,3000}${appOrService}`),
            new RegExp(`Fatal signal[^\\n]*${appOrService}`),
            new RegExp(`Fatal signal[\\s\\S]{0,5000}Cmdline:\\s*${escaped}`),
            new RegExp(`ANR in\\s+${escaped}`),
        ];

        if (crashPatterns.some((pattern) => pattern.test(logcat))) {
            throw new Error(
                'Fatal app or Android Auto service crash/ANR in logcat.',
            );
        }
    }

    async waitForChildExit(child, description, timeout = 5000) {
        await this.waitFor(
            () => !childProcessIsRunning(child),
            description,
            timeout,
        );
    }

    async stopDhu() {
        const child = this.dhuProcess;

        if (!child) {
            return;
        }

        if (childProcessIsRunning(child)) {
            try {
                child.stdin.write('exit\n');
            } catch {}

            try {
                await this.waitForChildExit(child, 'DHU to exit cleanly');
            } catch {
                child.kill('SIGTERM');
            }
        }

        if (childProcessIsRunning(child)) {
            try {
                await this.waitForChildExit(child, 'DHU to terminate');
            } catch {
                child.kill('SIGKILL');
                await this.waitForChildExit(child, 'DHU to be killed');
            }
        }

        this.dhuProcess = null;
    }

    signalMetroProcessGroup(child, signal) {
        try {
            process.kill(-child.pid, signal);
        } catch {
            if (childProcessIsRunning(child)) {
                child.kill(signal);
            }
        }
    }

    async waitForMetroExit(child, timeout = 5000) {
        const { port } = this.suite.metro;

        await this.waitFor(
            async () =>
                !childProcessIsRunning(child) && !(await this.portIsOpen(port)),
            `Metro process and port ${port} to stop`,
            timeout,
        );
    }

    async stopMetro() {
        const child = this.metroProcess;

        if (!child) {
            return;
        }

        this.signalMetroProcessGroup(child, 'SIGINT');

        try {
            await this.waitForMetroExit(child);
        } catch {
            this.signalMetroProcessGroup(child, 'SIGTERM');
        }

        try {
            await this.waitForMetroExit(child);
        } catch {
            this.signalMetroProcessGroup(child, 'SIGKILL');
            await this.waitForMetroExit(child);
        }

        this.metroProcess = null;
    }

    async stopServer() {
        if (!this.startedServer) {
            return;
        }

        if (!this.serverIsListening()) {
            this.startedServer = false;
            return;
        }

        await this.wakePhone();
        const xml = await this.openServerMenu();
        const bounds = findNodeBounds(xml, 'Stop head unit server');

        if (!bounds) {
            throw new Error(
                'Owned Android Auto head-unit server cannot be stopped from the overflow menu.',
            );
        }

        this.adb([
            'shell',
            'input',
            'tap',
            String(bounds.centerX),
            String(bounds.centerY),
        ]);
        await this.waitFor(
            () => !this.serverIsListening(),
            'owned Android Auto head-unit server to stop',
            15000,
        );
        this.startedServer = false;
    }

    async removeOwnedForward() {
        if (!this.ownsForward) {
            return;
        }

        const current = this.forwardForHeadUnitPort();

        if (!current) {
            this.ownsForward = false;
            return;
        }

        if (
            current.serial !== this.serial ||
            current.remote !== `tcp:${HEAD_UNIT_PORT}`
        ) {
            throw new Error(
                `Refusing to remove changed TCP ${HEAD_UNIT_PORT} forward owned by ${current.serial}.`,
            );
        }

        this.adb(['forward', '--remove', `tcp:${HEAD_UNIT_PORT}`]);
        await this.waitFor(
            () => !this.forwardForHeadUnitPort(),
            `owned ADB forward for TCP ${HEAD_UNIT_PORT} to be removed`,
            5000,
        );
        this.ownsForward = false;
    }

    cleanup() {
        if (this.cleanupPromise) {
            return this.cleanupPromise;
        }

        this.cleanupPromise = (async () => {
            const errors = [];
            const attempt = async (label, callback) => {
                try {
                    await callback();
                } catch (error) {
                    errors.push(new Error(`${label}: ${error.message}`));
                    this.report(`Cleanup error (${label}): ${error.message}`);
                }
            };

            if (
                this.preparedDevice ||
                this.phoneSleeping ||
                this.startedServer
            ) {
                await attempt('wake phone', () => this.wakePhone());
            }
            await attempt('stop DHU', () => this.stopDhu());
            await attempt('stop head-unit server', () => this.stopServer());
            await attempt('remove ADB forward', () =>
                this.removeOwnedForward(),
            );

            if (this.preparedDevice || this.startedApp) {
                await attempt('force-stop app', () => {
                    this.adb(['shell', 'am', 'force-stop', this.suite.appId]);
                    this.startedApp = false;
                });
                await attempt('verify car session stopped', () =>
                    this.waitFor(
                        () => !this.serviceRunning() && !this.wakeLockHeld(),
                        'Android Auto service and session wake lock to stop',
                        15000,
                    ),
                );
            }

            await attempt('stop Metro', () => this.stopMetro());
            if (this.preparedDevice) {
                await attempt('reset emulator location', () => {
                    this.run(
                        join(SCRIPT_DIRECTORY, 'reset-android-location.sh'),
                        [],
                        {
                            env: {
                                ...this.environment,
                                ANDROID_SERIAL: this.serial,
                            },
                        },
                    );
                    this.preparedDevice = false;
                });
            }

            if (errors.length) {
                throw new AggregateError(
                    errors,
                    `Android Auto E2E cleanup failed: ${errors.map((error) => error.message).join('; ')}`,
                );
            }
        })();

        return this.cleanupPromise;
    }

    async execute() {
        try {
            this.validate();
            this.compileOCR();
            await this.stopExistingDhu();
            await this.startMetro();
            this.prepareDevice();
            await this.wakePhone();
            await this.startServer();
            const outputStart = await this.launchApp();
            await this.startDhu();
            await this.waitForCarAppReady(outputStart);
            await this.runSuite();
            this.assertNoFatalCrash();
        } catch (error) {
            try {
                this.captureLogcat({ allowFailure: true });
            } catch (captureError) {
                this.report(
                    `Could not capture failure logcat: ${captureError.message}`,
                );
            }

            throw error;
        }
    }
}

async function main() {
    const runner = new Runner(process.argv[2] || DEFAULT_SUITE);

    for (const [signal, code] of [
        ['SIGINT', 130],
        ['SIGTERM', 143],
    ]) {
        process.once(signal, () => {
            runner
                .cleanup()
                .catch((error) => {
                    console.error(error.message);
                })
                .finally(() => process.exit(code));
        });
    }

    let executionError;
    let cleanupError;

    try {
        await runner.execute();
    } catch (error) {
        executionError = error;
    }

    try {
        await runner.cleanup();
    } catch (error) {
        cleanupError = error;
    }

    if (executionError && cleanupError) {
        throw new AggregateError(
            [executionError, cleanupError],
            `${executionError.message}; ${cleanupError.message}`,
        );
    }

    if (executionError) {
        throw executionError;
    }

    if (cleanupError) {
        try {
            runner.captureLogcat({ allowFailure: true });
        } catch {}

        throw cleanupError;
    }

    runner.report(
        `PASS ${runner.suite.name} (${runner.suite.tests.length} tests)`,
    );
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    main().catch((error) => {
        console.error(`Android Auto E2E failed: ${error.message}`);
        process.exitCode = 1;
    });
}
