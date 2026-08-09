#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
    closeSync,
    existsSync,
    openSync,
    readdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const EXPO_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_APP_ID = 'com.anonymous.drivefree.dev';
const DEFAULT_DEV_CLIENT_SCHEME = 'exp+driversagainstflock';
const DEFAULT_METRO_PORTS = Array.from(
    { length: 20 },
    (_, index) => 8081 + index,
);
const METRO_START_TIMEOUT = 60000;
const DEV_CLIENT_BUNDLE_TIMEOUTS = [90000, 45000];

const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

function formatCommand(command, args) {
    return [command, ...args]
        .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
        .join(' ');
}

function runCommand(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? EXPO_DIRECTORY,
        encoding: 'utf8',
        env: options.env ?? process.env,
        stdio: options.stdio ?? 'pipe',
    });

    if (result.error && !options.allowFailure) {
        throw result.error;
    }

    if (result.status !== 0 && !options.allowFailure) {
        const output = [result.stdout, result.stderr]
            .filter(Boolean)
            .join('\n')
            .trim();
        throw new Error(
            `${formatCommand(command, args)} failed${output ? `:\n${output}` : '.'}`,
        );
    }

    return result;
}

export function parseAdbDevices(output) {
    return output
        .split('\n')
        .map((line) => line.trim().match(/^(\S+)\s+device(?:\s+.*)?$/))
        .filter(Boolean)
        .map((match) => ({
            id: match[1],
            name: match[1],
            platform: 'android',
        }));
}

export function parseBootedIosSimulators(output) {
    const parsed = JSON.parse(output);

    return Object.entries(parsed.devices ?? {})
        .filter(([runtime]) => runtime.includes('iOS'))
        .flatMap(([, devices]) => devices)
        .filter(
            (device) =>
                device.state === 'Booted' && device.isAvailable !== false,
        )
        .map((device) => ({
            id: device.udid,
            name: device.name,
            platform: 'ios',
        }));
}

function formatTargets(targets) {
    return targets.map(({ id, name }) => `${name} (${id})`).join(', ');
}

export function selectMaestroTarget({
    androidDevices,
    iosDevices,
    requestedDevice,
    requestedPlatform,
}) {
    if (
        requestedPlatform &&
        !['android', 'ios'].includes(requestedPlatform.toLowerCase())
    ) {
        throw new Error(
            `Unsupported MAESTRO_PLATFORM: ${requestedPlatform}. Use android or ios.`,
        );
    }

    const platform = requestedPlatform?.toLowerCase();
    const available = platform
        ? platform === 'android'
            ? androidDevices
            : iosDevices
        : [...androidDevices, ...iosDevices];
    const requestedMatches = requestedDevice
        ? available.filter(
              ({ id, name }) =>
                  id === requestedDevice || name === requestedDevice,
          )
        : [];

    if (requestedDevice && requestedMatches.length !== 1) {
        throw new Error(
            `MAESTRO_DEVICE did not identify exactly one booted ${platform ?? 'mobile'} target: ${requestedDevice}. Available: ${formatTargets(available) || 'none'}.`,
        );
    }

    if (requestedMatches.length === 1) {
        return requestedMatches[0];
    }

    if (platform && available.length !== 1) {
        throw new Error(
            `Expected exactly one booted ${platform} target. Available: ${formatTargets(available) || 'none'}. Set MAESTRO_DEVICE explicitly.`,
        );
    }

    if (platform) {
        return available[0];
    }

    const availablePlatforms = [
        androidDevices.length > 0 ? 'android' : null,
        iosDevices.length > 0 ? 'ios' : null,
    ].filter(Boolean);

    if (availablePlatforms.length !== 1) {
        throw new Error(
            'Unable to choose one Maestro platform. Use npm run e2e:android or npm run e2e:ios.',
        );
    }

    const platformTargets =
        availablePlatforms[0] === 'android' ? androidDevices : iosDevices;

    if (platformTargets.length !== 1) {
        throw new Error(
            `Expected exactly one booted ${availablePlatforms[0]} target. Available: ${formatTargets(platformTargets)}. Set MAESTRO_DEVICE explicitly.`,
        );
    }

    return platformTargets[0];
}

export function createExpoDevClientUrl({ host, port, scheme }) {
    const manifestUrl = `http://${host}:${port}?disableOnboarding=1`;

    return `${scheme}://expo-development-client/?url=${encodeURIComponent(manifestUrl)}`;
}

export function createExpoStartArgs({ hostType, port, scheme }) {
    return [
        'start',
        '--dev-client',
        '--host',
        hostType,
        '--scheme',
        scheme,
        '--port',
        String(port),
    ];
}

export function createMetroNodeOptions(existingOptions, hostType) {
    if (hostType !== 'localhost') {
        return existingOptions;
    }

    const options = (existingOptions || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter((option) => !option.startsWith('--dns-result-order='));

    return [...options, '--dns-result-order=ipv4first'].join(' ');
}

export function createAndroidDevClientLaunchArgs({ appId, url }) {
    return [
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        url,
        appId,
    ];
}

export function selectManagedMetroConnection({
    androidEmulator = false,
    hostOverride,
    platform,
}) {
    if (hostOverride) {
        return {
            host: hostOverride,
            hostType:
                hostOverride === 'localhost' ||
                hostOverride === '127.0.0.1' ||
                hostOverride === '::1'
                    ? 'localhost'
                    : 'lan',
            requiresAdbReverse: false,
        };
    }

    if (platform === 'ios') {
        return {
            host: '127.0.0.1',
            hostType: 'localhost',
            requiresAdbReverse: false,
        };
    }

    if (androidEmulator) {
        return {
            host: '10.0.2.2',
            hostType: 'lan',
            requiresAdbReverse: false,
        };
    }

    return {
        host: 'localhost',
        hostType: 'localhost',
        requiresAdbReverse: true,
    };
}

export function collectMaestroFlows(targets, workingDirectory = process.cwd()) {
    const flows = [];

    for (const target of targets) {
        const resolvedTarget = path.resolve(workingDirectory, target);

        if (!existsSync(resolvedTarget)) {
            throw new Error(`Maestro target does not exist: ${target}`);
        }

        if (statSync(resolvedTarget).isDirectory()) {
            flows.push(
                ...readdirSync(resolvedTarget)
                    .filter((entry) => /\.ya?ml$/i.test(entry))
                    .sort()
                    .map((entry) => path.join(resolvedTarget, entry)),
            );
        } else {
            flows.push(resolvedTarget);
        }
    }

    if (flows.length === 0) {
        throw new Error('No Maestro flows found.');
    }

    return flows;
}

async function portIsAvailable(port) {
    return await new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
            server.close(() => resolve(true));
        });
    });
}

export async function selectMetroPort(requestedPort) {
    const candidates = requestedPort
        ? [Number.parseInt(requestedPort, 10)]
        : DEFAULT_METRO_PORTS;

    if (
        candidates.some(
            (candidate) =>
                !Number.isInteger(candidate) ||
                candidate < 1024 ||
                candidate > 65535,
        )
    ) {
        throw new Error(
            `Invalid MAESTRO_METRO_PORT: ${requestedPort}. Use a port from 1024 through 65535.`,
        );
    }

    for (const candidate of candidates) {
        if (await portIsAvailable(candidate)) {
            return candidate;
        }
    }

    if (requestedPort) {
        throw new Error(
            `Managed Metro port ${requestedPort} is already in use. Stop that process or choose another MAESTRO_METRO_PORT.`,
        );
    }

    throw new Error(
        'No available managed Metro port found from 8081 through 8100.',
    );
}

function metroIsReady(host, port) {
    return new Promise((resolve) => {
        const request = http.get(
            {
                host,
                path: '/status',
                port,
                timeout: 1000,
            },
            (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    resolve(
                        response.statusCode === 200 &&
                            body.includes('packager-status:running'),
                    );
                });
            },
        );
        request.once('error', () => resolve(false));
        request.once('timeout', () => {
            request.destroy();
            resolve(false);
        });
    });
}

async function waitFor(check, description, timeout) {
    const deadline = Date.now() + timeout;
    let lastError;

    while (Date.now() < deadline) {
        try {
            if (await check()) {
                return;
            }
        } catch (error) {
            lastError = error;
        }

        await delay(250);
    }

    throw new Error(
        `Timed out waiting for ${description}.${lastError ? ` ${lastError.message}` : ''}`,
    );
}

function processIsRunning(child) {
    if (!child?.pid) {
        return false;
    }

    try {
        process.kill(child.pid, 0);
        return true;
    } catch {
        return false;
    }
}

function tailFile(file, lineCount = 60) {
    if (!existsSync(file)) {
        return '';
    }

    return readFileSync(file, 'utf8').split('\n').slice(-lineCount).join('\n');
}

export class MaestroTestRunner {
    constructor({
        args = process.argv.slice(2),
        environment = process.env,
    } = {}) {
        this.args = args;
        this.environment = { ...environment };
        this.appId = environment.MAESTRO_APP_ID || DEFAULT_APP_ID;
        this.debugDirectory = environment.MAESTRO_DEBUG_DIR;
        this.metroLogDirectory = environment.MAESTRO_METRO_LOG_DIR;
        this.scheme =
            environment.MAESTRO_EXPO_DEV_CLIENT_SCHEME ||
            DEFAULT_DEV_CLIENT_SCHEME;
        this.manageMetro = environment.MAESTRO_MANAGE_METRO !== '0';
        this.metroProcess = null;
        this.metroLogDescriptor = null;
        this.ownsAdbReverse = false;
        this.cleanedUp = false;
    }

    report(message) {
        process.stdout.write(`[maestro-e2e] ${message}\n`);
    }

    discoverTarget() {
        const adbResult = runCommand('adb', ['devices'], {
            allowFailure: true,
        });
        const iosResult = runCommand(
            'xcrun',
            ['simctl', 'list', 'devices', 'booted', '-j'],
            { allowFailure: true },
        );
        const androidDevices = adbResult.error
            ? []
            : parseAdbDevices(adbResult.stdout || '');
        const iosDevices =
            iosResult.status === 0
                ? parseBootedIosSimulators(iosResult.stdout || '{}')
                : [];

        return selectMaestroTarget({
            androidDevices,
            iosDevices,
            requestedDevice: this.environment.MAESTRO_DEVICE,
            requestedPlatform: this.environment.MAESTRO_PLATFORM,
        });
    }

    adb(args, options = {}) {
        return runCommand('adb', ['-s', this.target.id, ...args], options);
    }

    verifyTarget() {
        if (this.target.platform === 'android') {
            this.adb(['get-state']);
            const packageResult = this.adb(
                ['shell', 'pm', 'path', this.appId],
                { allowFailure: true },
            );

            if (
                packageResult.status !== 0 ||
                !packageResult.stdout?.includes('package:')
            ) {
                throw new Error(
                    `${this.appId} is not installed on Android target ${this.target.id}.`,
                );
            }
        } else {
            runCommand('xcrun', [
                'simctl',
                'get_app_container',
                this.target.id,
                this.appId,
                'app',
            ]);
        }

        const maestroVersion = runCommand('maestro', ['--version']);
        this.report(
            `Using ${this.target.platform} target ${this.target.name} (${this.target.id}) with Maestro ${maestroVersion.stdout.trim()}`,
        );
    }

    androidIsEmulator() {
        const result = this.adb(['shell', 'getprop', 'ro.kernel.qemu'], {
            allowFailure: true,
        });

        return result.status === 0 && result.stdout.trim() === '1';
    }

    configureMetroAddress() {
        const connection = selectManagedMetroConnection({
            androidEmulator:
                this.target.platform === 'android' && this.androidIsEmulator(),
            hostOverride: this.environment.MAESTRO_METRO_HOST,
            platform: this.target.platform,
        });

        this.metroHost = connection.host;
        this.metroHostType = connection.hostType;

        if (connection.requiresAdbReverse) {
            this.adb([
                'reverse',
                `tcp:${this.metroPort}`,
                `tcp:${this.metroPort}`,
            ]);
            this.ownsAdbReverse = true;
        }
    }

    async startMetro() {
        const expoBinary = path.join(
            EXPO_DIRECTORY,
            'node_modules',
            '.bin',
            'expo',
        );

        if (!existsSync(expoBinary)) {
            throw new Error(
                `Local Expo CLI is missing at ${expoBinary}. Run npm ci in ${EXPO_DIRECTORY}.`,
            );
        }

        this.metroPort = await selectMetroPort(
            this.environment.MAESTRO_METRO_PORT,
        );
        this.configureMetroAddress();
        this.metroReadinessHost =
            this.metroHostType === 'localhost' ? this.metroHost : '127.0.0.1';
        this.devClientUrl = createExpoDevClientUrl({
            host: this.metroHost,
            port: this.metroPort,
            scheme: this.scheme,
        });
        this.metroLog = path.join(
            this.metroLogDirectory,
            `metro-${this.target.platform}.log`,
        );
        this.metroLogDescriptor = openSync(this.metroLog, 'w');

        this.report(`Starting managed Metro on port ${this.metroPort}`);
        this.metroProcess = spawn(
            expoBinary,
            createExpoStartArgs({
                hostType: this.metroHostType,
                port: this.metroPort,
                scheme: this.scheme,
            }),
            {
                cwd: EXPO_DIRECTORY,
                env: {
                    ...this.environment,
                    APP_ENV: 'e2e',
                    CI: '1',
                    EXPO_PUBLIC_E2E_MAP_API_MOCKS: '1',
                    FORCE_COLOR: '0',
                    NODE_OPTIONS: createMetroNodeOptions(
                        this.environment.NODE_OPTIONS,
                        this.metroHostType,
                    ),
                },
                stdio: [
                    'ignore',
                    this.metroLogDescriptor,
                    this.metroLogDescriptor,
                ],
            },
        );
        this.metroProcessError = null;
        this.metroProcess.once('error', (error) => {
            this.metroProcessError = error;
        });

        try {
            await waitFor(
                async () => {
                    if (this.metroProcessError) {
                        throw this.metroProcessError;
                    }

                    if (!processIsRunning(this.metroProcess)) {
                        throw new Error('Managed Metro stopped unexpectedly.');
                    }

                    return await metroIsReady(
                        this.metroReadinessHost,
                        this.metroPort,
                    );
                },
                `managed Metro on port ${this.metroPort}`,
                METRO_START_TIMEOUT,
            );
        } catch (error) {
            throw new Error(
                `${error.message}\nMetro log: ${this.metroLog}\n${tailFile(this.metroLog)}`,
            );
        }

        this.report(`Managed Metro is ready: ${this.devClientUrl}`);
    }

    async configureUnmanagedMetro() {
        if (!this.environment.MAESTRO_EXPO_DEV_CLIENT_URL) {
            throw new Error(
                'MAESTRO_MANAGE_METRO=0 requires MAESTRO_EXPO_DEV_CLIENT_URL.',
            );
        }

        this.devClientUrl = this.environment.MAESTRO_EXPO_DEV_CLIENT_URL;
        this.report(
            `Using caller-managed development client URL: ${this.devClientUrl}`,
        );
    }

    forceStopApp() {
        if (this.target.platform === 'android') {
            this.adb(['shell', 'am', 'force-stop', this.appId], {
                allowFailure: true,
            });
            return;
        }

        runCommand(
            'xcrun',
            ['simctl', 'terminate', this.target.id, this.appId],
            { allowFailure: true },
        );
    }

    openDevelopmentClient() {
        this.forceStopApp();

        if (this.target.platform === 'android') {
            this.adb(
                createAndroidDevClientLaunchArgs({
                    appId: this.appId,
                    url: this.devClientUrl,
                }),
            );
            return;
        }

        runCommand('xcrun', [
            'simctl',
            'openurl',
            this.target.id,
            this.devClientUrl,
        ]);
    }

    bundleMarkerIsVisible() {
        if (!this.metroLog || !existsSync(this.metroLog)) {
            return false;
        }

        const marker =
            this.target.platform === 'ios' ? 'iOS Bundled' : 'Android Bundled';

        return readFileSync(this.metroLog, 'utf8').includes(marker);
    }

    async bootstrapDevelopmentClient() {
        if (!this.manageMetro) {
            this.openDevelopmentClient();
            return;
        }

        const failures = [];

        for (
            let index = 0;
            index < DEV_CLIENT_BUNDLE_TIMEOUTS.length;
            index += 1
        ) {
            const attempt = index + 1;
            this.report(
                `Opening the managed development client URL (attempt ${attempt}/${DEV_CLIENT_BUNDLE_TIMEOUTS.length})`,
            );
            this.openDevelopmentClient();

            try {
                await waitFor(
                    () => this.bundleMarkerIsVisible(),
                    `${this.target.platform} bundle from managed Metro`,
                    DEV_CLIENT_BUNDLE_TIMEOUTS[index],
                );
                this.report(
                    `${this.target.platform} development client loaded the managed Metro bundle`,
                );
                return;
            } catch (error) {
                failures.push(error.message);
            }
        }

        throw new Error(
            `The development client never requested the managed Metro bundle. ${failures.join(' ')}\nMetro log: ${this.metroLog}\n${tailFile(this.metroLog)}`,
        );
    }

    resetAndroidLocation() {
        if (!this.target || this.target.platform !== 'android') {
            return;
        }

        runCommand(
            path.join(SCRIPT_DIRECTORY, 'reset-android-location.sh'),
            [],
            {
                allowFailure: true,
                env: {
                    ...this.environment,
                    ANDROID_SERIAL: this.target.id,
                },
                stdio: 'inherit',
            },
        );
    }

    runMaestroFlow(flow) {
        const args = [
            '--platform',
            this.target.platform,
            '--device',
            this.target.id,
            'test',
            '--debug-output',
            this.debugDirectory,
            flow,
        ];
        const result = runCommand('maestro', args, {
            allowFailure: true,
            env: {
                ...this.environment,
                MAESTRO_DEVICE: this.target.id,
                MAESTRO_EXPO_DEV_CLIENT_URL: this.devClientUrl,
                MAESTRO_PLATFORM: this.target.platform,
            },
            stdio: 'inherit',
        });

        if (result.error) {
            throw result.error;
        }

        return result.status ?? 1;
    }

    async runFlow(flow) {
        const flowName = path.relative(EXPO_DIRECTORY, flow);
        const maximumAttempts = Number.parseInt(
            this.environment.MAESTRO_FLOW_ATTEMPTS || '2',
            10,
        );

        if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
            throw new Error(
                `Invalid MAESTRO_FLOW_ATTEMPTS: ${this.environment.MAESTRO_FLOW_ATTEMPTS}.`,
            );
        }

        for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
            this.resetAndroidLocation();
            this.report(
                `Running ${flowName} (attempt ${attempt}/${maximumAttempts})`,
            );

            const status = this.runMaestroFlow(flow);

            if (status === 0) {
                return;
            }

            if (attempt < maximumAttempts) {
                this.report(`Retrying failed Maestro flow: ${flowName}`);
            } else {
                throw new Error(
                    `Maestro flow failed after ${maximumAttempts} attempt(s): ${flowName}`,
                );
            }
        }
    }

    async stopMetro() {
        if (!this.metroProcess || !processIsRunning(this.metroProcess)) {
            return;
        }

        const signalMetro = (signal) => {
            try {
                process.kill(this.metroProcess.pid, signal);
            } catch {}
        };

        signalMetro('SIGINT');

        try {
            await waitFor(
                () => !processIsRunning(this.metroProcess),
                'managed Metro to stop',
                5000,
            );
        } catch {
            signalMetro('SIGTERM');

            try {
                await waitFor(
                    () => !processIsRunning(this.metroProcess),
                    'managed Metro to terminate',
                    3000,
                );
            } catch {
                signalMetro('SIGKILL');
            }
        }
    }

    async cleanup() {
        if (this.cleanedUp) {
            return;
        }

        this.cleanedUp = true;
        this.resetAndroidLocation();

        if (this.ownsAdbReverse) {
            this.adb(['reverse', '--remove', `tcp:${this.metroPort}`], {
                allowFailure: true,
            });
        }

        await this.stopMetro();

        if (this.metroLogDescriptor !== null) {
            closeSync(this.metroLogDescriptor);
            this.metroLogDescriptor = null;
        }
    }

    async run() {
        if (!this.debugDirectory || !this.metroLogDirectory) {
            throw new Error(
                'Run Maestro through scripts/maestro-test.sh so external artifact storage is configured.',
            );
        }

        this.flows = collectMaestroFlows(this.args, EXPO_DIRECTORY);
        this.target = this.discoverTarget();
        this.verifyTarget();

        if (this.manageMetro) {
            await this.startMetro();
        } else {
            await this.configureUnmanagedMetro();
        }

        await this.bootstrapDevelopmentClient();

        for (const flow of this.flows) {
            await this.runFlow(flow);
        }
    }
}

function isMainModule() {
    return (
        process.argv[1] &&
        path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    );
}

if (isMainModule()) {
    const runner = new MaestroTestRunner();
    let exitCode = 0;

    const stopForSignal = (signal, signalExitCode) => {
        process.stderr.write(
            `\n[maestro-e2e] Received ${signal}; cleaning up.\n`,
        );
        void runner.cleanup().finally(() => process.exit(signalExitCode));
    };

    process.once('SIGINT', () => stopForSignal('SIGINT', 130));
    process.once('SIGTERM', () => stopForSignal('SIGTERM', 143));

    try {
        await runner.run();
    } catch (error) {
        process.stderr.write(`[maestro-e2e] ${error.stack || error.message}\n`);
        exitCode = 1;
    } finally {
        await runner.cleanup();
    }

    process.exitCode = exitCode;
}
