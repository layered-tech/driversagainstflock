#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import {
    getConfirmationCameraStabilityAssertionFailure,
    normalizeOCRText,
} from './android-auto-e2e.mjs';
import {
    buildCarPlayNavigationSuite,
    carPlayStateMatches,
    getCarPlayIconPoint,
    getCarPlayKeyboardPoints,
    getCarPlayNavigationUIFailure,
} from './carplay-navigation-suite.mjs';

import {
    assertRouteOverview,
    captureRouteOverviewBaseline,
} from './automotive-route-overview.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const EXPO_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..');
export const GPX_FILE = join(
    EXPO_DIRECTORY,
    '.android-auto/route-pewaukee.gpx',
);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const SCENARIO_NAMES = [
    'warns about an upcoming mapped ALPR along the saved road',
    'confirms the camera after an actual GPS pass',
    'expires confirmation and restores map status while continuing the drive',
    'Dashboard: Still there / Dismiss restores follow without reporting',
    'Dashboard: Not there queues one report and Ok closes Thanks',
];

export function getCarPlayMetroArgs(port) {
    return [
        'expo',
        'start',
        '--dev-client',
        '--offline',
        '--port',
        String(port),
    ];
}

export function findCarPlayAction(observations, title) {
    const label = normalizeOCRText(title);
    const matches = observations.filter(({ text }) => {
        const value = normalizeOCRText(text);
        return (
            value === label ||
            (label === 'dismiss' &&
                /^still there(?: [il])? dismiss$/.test(value))
        );
    });
    if (matches.length !== 1)
        throw new Error(`Expected one visible CarPlay action: ${title}`);
    return matches[0];
}

export function findCarPlaySearchResult(shot, title, occurrence = 0) {
    return shot.observations
        .filter(
            ({ text, x, y }) =>
                normalizeOCRText(text)
                    .replace(/^\d+[.)]?\s+/, '')
                    .startsWith(normalizeOCRText(title)) &&
                x < shot.width * 0.55 &&
                y > shot.height * 0.12,
        )
        .sort((first, second) => first.y - second.y)[occurrence];
}

export function getCarPlayAppLaunchPoint(shot) {
    if (
        shot.observations.some(
            ({ text, y }) =>
                normalizeOCRText(text) === 'search' && y > shot.height * 0.7,
        )
    ) {
        return {
            x: Math.round(shot.width * 0.55),
            y: Math.round(shot.height * 0.25),
        };
    }
    const labels = shot.observations.map(({ text }) => normalizeOCRText(text));
    if (!labels.includes('phone') || !labels.includes('messages')) return null;
    const label = shot.observations.find(({ text }) =>
        /^(dev.?driv|drivers ?against)/.test(normalizeOCRText(text)),
    );
    return label
        ? { x: label.x, y: Math.max(0, label.y - shot.height * 0.08) }
        : null;
}

export function matchesCarPlayText(observations, step) {
    const text = normalizeOCRText(
        observations.map((item) => item.text).join(' '),
    );
    return (
        (step.contains || []).every((value) =>
            text.includes(normalizeOCRText(value)),
        ) &&
        (step.notContains || []).every(
            (value) => !text.includes(normalizeOCRText(value)),
        )
    );
}

export function getCarPlayTap(shot, point) {
    if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > shot.width ||
        point.y > shot.height
    ) {
        throw new Error('OCR action is outside the CarPlay display');
    }
    if (shot.toolbarHeight === undefined) {
        return { x: point.x / shot.width, y: point.y / shot.height };
    }
    const inset = shot.displayInset;
    const width = shot.windowWidth - 2 * inset;
    const height = (width * shot.height) / shot.width;
    return {
        x: (inset + (point.x / shot.width) * width) / shot.windowWidth,
        y:
            (shot.toolbarHeight + inset + (point.y / shot.height) * height) /
            shot.windowHeight,
    };
}

export function buildCarPlaySuite(androidSuite) {
    return SCENARIO_NAMES.map((name, index) => {
        const original = androidSuite.tests.find(
            (scenario) => scenario.name === name,
        );
        if (!original)
            throw new Error(`Missing Android ALPR scenario: ${name}`);
        return {
            name: name.replace('Dashboard: ', ''),
            drive:
                index < 3
                    ? 'pass-and-expiry'
                    : index === 3
                      ? 'dismiss'
                      : 'not-there',
            steps: original.steps
                .filter(
                    (step) =>
                        ![
                            'carLayout',
                            'assertPuckVisible',
                            'resetLiveGpsDrive',
                        ].includes(step.type),
                )
                .map((step) =>
                    step.type === 'replayRoute'
                        ? { type: 'routeCheckpoint', atMs: step.toMs }
                        : {
                              ...step,
                              ...(step.type === 'assertOcr' &&
                              step.screenshot === 'saved-route-upcoming'
                                  ? { contains: ['ALPR', 'ahead', 'OK'] }
                                  : {}),
                              ...(step.type === 'tapOcr' && step.text === 'Ok'
                                  ? {
                                        waitForMetro:
                                            '[E2E] presence:native-thanks-dismissed:user',
                                    }
                                  : {}),
                          },
                ),
        };
    });
}

export function selectUSBDevice(devices, requested) {
    const matches = devices.filter(
        (device) =>
            device.ConnectionType === 'USB' &&
            device.DeviceClass === 'iPhone' &&
            (!requested || device.UniqueDeviceID === requested),
    );
    if (matches.length !== 1) {
        throw new Error(
            'Connect one iPhone by USB, or select it with CARPLAY_E2E_UDID',
        );
    }
    return matches[0].UniqueDeviceID;
}

export function readMarkers(output, marker) {
    return stripVTControlCharacters(output)
        .split('\n')
        .filter((line) => line.includes(marker))
        .map((line) =>
            JSON.parse(line.slice(line.indexOf(marker) + marker.length)),
        );
}

export function assertReportProof(output, count, osmNodeId, baseline = 0) {
    const reports = readMarkers(output, '[E2E] presence-report-queued ');
    if (
        reports.length !== count ||
        reports.some(
            (report, index) =>
                report.count !== baseline + index + 1 ||
                report.osmNodeId !== osmNodeId ||
                report.response !== 'not_there' ||
                report.platform !== 'carplay',
        )
    )
        throw new Error(
            `Unexpected CarPlay queued reports: ${JSON.stringify(reports)}`,
        );
}

export class CarPlayRunner {
    constructor(environment = process.env) {
        this.environment = environment;
        this.port = Number(environment.CARPLAY_E2E_METRO_PORT || 8092);
        this.appId = 'com.anonymous.drivefree.dev';
        this.suite = buildCarPlaySuite(
            JSON.parse(
                readFileSync(
                    join(EXPO_DIRECTORY, '.android-auto/suite.json'),
                    'utf8',
                ),
            ),
        );
        const group = environment.CARPLAY_E2E_SUITE || 'all';
        if (!['all', 'alpr', 'navigation', 'route-choices'].includes(group))
            throw new Error(
                'CARPLAY_E2E_SUITE must be all, alpr, navigation or route-choices',
            );
        if (['navigation', 'route-choices'].includes(group)) this.suite = [];
        if (group !== 'alpr') this.suite.push(...buildCarPlayNavigationSuite());
        if (group === 'route-choices')
            this.suite = this.suite.filter(({ steps }) =>
                steps.some(({ type }) => type === 'assertRouteOverview'),
            );
        if (environment.CARPLAY_E2E_SCENARIO) {
            this.suite = this.suite.filter(({ name }) =>
                name
                    .toLowerCase()
                    .includes(environment.CARPLAY_E2E_SCENARIO.toLowerCase()),
            );
            if (!this.suite.length)
                throw new Error(
                    'No CarPlay scenario matches CARPLAY_E2E_SCENARIO',
                );
        }
        this.directory = join(
            environment.CARPLAY_E2E_ARTIFACTS_DIR ||
                join(tmpdir(), 'daf-carplay-e2e'),
            new Date().toISOString().replace(/[:.]/g, '-'),
        );
        this.metroOutput = '';
        this.gpsMessages = [];
        this.gpsSequence = 0;
        this.screenshots = new Map();
        this.queueBaseline = 0;
        this.reportOffset = 0;
        this.results = [];
    }

    report(message) {
        console.log(message);
        appendFileSync(
            join(this.directory, 'harness.log'),
            `${new Date().toISOString()} ${message}\n`,
        );
    }

    run(command, args, options = {}) {
        const result = spawnSync(command, args, {
            cwd: EXPO_DIRECTORY,
            env: this.environment,
            encoding: 'utf8',
            timeout: 30000,
            maxBuffer: 24 * 1024 * 1024,
            ...options,
        });
        if (result.error || result.status !== 0) {
            throw new Error(
                `${command} failed: ${result.error?.message || result.stderr || result.stdout}`,
            );
        }
        return result.stdout;
    }

    pmd(args) {
        return this.run('uv', [
            'run',
            '--no-project',
            '--with',
            'pymobiledevice3==11.45.0',
            'pymobiledevice3',
            ...args,
        ]);
    }

    async until(predicate, description, timeout = 30000) {
        const deadline = Date.now() + timeout;
        while (true) {
            if (this.processError) throw this.processError;
            if (await predicate()) return;
            if (Date.now() >= deadline)
                throw new Error(`Timed out: ${description}`);
            await wait(200);
        }
    }

    marker(marker, offset, timeout = 30000) {
        return this.until(
            () => this.metroOutput.slice(offset).includes(marker),
            marker,
            timeout,
        );
    }

    launchURL(url, { restart = false } = {}) {
        this.run('xcrun', [
            'devicectl',
            'device',
            'process',
            'launch',
            '--device',
            this.udid,
            ...(restart ? ['--terminate-existing'] : []),
            '--payload-url',
            url,
            this.appId,
        ]);
    }

    async resetDrive() {
        this.cameraOffset = this.metroOutput.length;
        const offset = this.metroOutput.length;
        this.launchURL('driversagainstflock://e2e-mocks?liveGpsDrive=reset');
        await this.marker('[E2E] live-gps-drive-reset', offset);
        const state = readMarkers(
            this.metroOutput.slice(offset),
            '[E2E] live-gps-drive-state ',
        ).at(-1);
        if (
            state?.environment !== 'e2e' ||
            !Number.isInteger(state.queuedReports)
        ) {
            throw new Error(
                'CarPlay tests require the managed E2E bundle and isolated report outbox',
            );
        }
        return state.queuedReports;
    }

    async gpsRequest(command) {
        const id = ++this.gpsSequence;
        this.gps.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
        await this.until(
            () => this.gpsMessages.some((message) => message.id === id),
            `GPS ${command.command}`,
            15000,
        );
        const response = this.gpsMessages.find((message) => message.id === id);
        if (response.error) throw new Error(response.error);
        return response;
    }

    async waitForRouteTime(atMs) {
        await this.until(
            () =>
                this.gpsMessages.some(
                    (message) => message.progress && message.atMs >= atMs,
                ),
            `GPX player to reach ${atMs} ms`,
            this.routeDurationMs + 60000,
        );
    }

    takeDisplayScreenshot(image) {
        this.run('xcrun', [
            'devicectl',
            'device',
            'capture',
            'screenshot',
            '--device',
            this.udid,
            '--display-unique-id',
            'VideoStream.Main',
            '--destination',
            image,
        ]);
        const png = readFileSync(image);
        if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
            throw new Error('CarPlay capture is not a PNG');
        return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    }

    capture(name) {
        const image = join(this.directory, `${name}.png`);
        const dimensions = this.takeDisplayScreenshot(image);
        this.displayWidth = dimensions.width;
        this.displayHeight = dimensions.height;
        const geometry = JSON.parse(this.run(this.hostBinary, ['geometry']));
        const observations = JSON.parse(
            this.run(this.ocrBinary, ['--observations', image], {
                env: { ...this.environment, DAF_E2E_OCR_CARPLAY: '1' },
            }),
        );
        const screenshot = {
            image,
            ...dimensions,
            ...geometry,
            observations,
            capturedAt: Date.now(),
        };
        this.screenshots.set(name, screenshot);
        writeFileSync(
            join(this.directory, `${name}.ocr.json`),
            JSON.stringify(observations, null, 2),
        );
        return screenshot;
    }

    async assertText(step) {
        const existing = this.screenshots.get(step.screenshot);
        if (
            existing &&
            Date.now() - existing.capturedAt < 2000 &&
            matchesCarPlayText(existing.observations, step)
        )
            return;
        let firstCapture = !existing;
        await this.until(
            async () => {
                if (!firstCapture)
                    await wait(step.retryDelayMilliseconds ?? 1500);
                firstCapture = false;
                const screenshot = this.capture(step.screenshot);
                return matchesCarPlayText(screenshot.observations, step);
            },
            `CarPlay text ${JSON.stringify(step)}`,
            step.timeout || 10000,
        );
    }

    async ensureCarPlayMap() {
        let openedAt = 0;
        let nextCaptureAt = 0;
        await this.until(
            () => {
                if (Date.now() < nextCaptureAt) return false;
                const shot = this.capture('carplay-map-ready');
                nextCaptureAt = Date.now() + 2500;
                if (
                    matchesCarPlayText(shot.observations, {
                        contains: ['Car screen unavailable'],
                    })
                )
                    throw new Error('CarPlay root template is unavailable');
                const point = getCarPlayAppLaunchPoint(shot);
                if (
                    !point &&
                    this.metroOutput.includes('[Android Auto] map-loaded')
                )
                    return true;
                if (point && Date.now() - openedAt > 5000) {
                    const tap = getCarPlayTap(shot, point);
                    this.run(this.hostBinary, [
                        'tap',
                        String(tap.x),
                        String(tap.y),
                    ]);
                    this.report(
                        'Selected the development app from the CarPlay launcher',
                    );
                    openedAt = Date.now();
                }
                return false;
            },
            'DAF map on the CarPlay display',
            60000,
        );
    }

    async tapText(step) {
        // Find the action on a fresh image; a stale Thanks button can disappear in seconds.
        const checkpoint = this.screenshots.get(step.screenshot);
        const shot =
            step.requireUserSelection &&
            checkpoint &&
            Date.now() - checkpoint.capturedAt < 1500
                ? checkpoint
                : this.capture(step.screenshot);
        const action =
            step.match === 'result'
                ? findCarPlaySearchResult(shot, step.text, step.occurrence || 0)
                : findCarPlayAction(shot.observations, step.text);
        if (!action) throw new Error(`No visible result: ${step.text}`);
        const offset = this.metroOutput.length;
        const tap = getCarPlayTap(shot, action);
        const input = this.run(this.hostBinary, [
            'tap',
            String(tap.x),
            String(tap.y),
        ]);
        this.report(`CarPlay action ${step.text}: ${input.trim()}`);
        for (const marker of [
            step.waitForMetro,
            step.waitForPresentation,
        ].filter(Boolean)) {
            await this.marker(marker, offset, 10000);
        }
        if (
            step.requireUserSelection &&
            this.metroOutput
                .slice(this.scenarioOffset || 0)
                .includes('[CarPlay] single-result-auto-advanced')
        )
            throw new Error(
                'The result auto-advanced before the native selection was verified',
            );
    }

    async carPlayCommand(command, parameters = {}) {
        const offset = this.metroOutput.length;
        const query = new URLSearchParams({ command, ...parameters });
        this.launchURL(`driversagainstflock://e2e-carplay?${query}`);
        const markers = {
            seed: 'carplay-seeded',
            reset: 'carplay-ui-reset',
            voice: 'carplay-voice-armed',
            state: 'carplay-state ',
            'route-render': 'carplay-route-render ',
            locations: 'carplay-locations-set ',
        };
        await this.marker(`[E2E] ${markers[command]}`, offset, 20000);
        if (['state', 'route-render'].includes(command)) {
            const snapshot = readMarkers(
                this.metroOutput.slice(offset),
                `[E2E] ${markers[command]}`,
            ).at(-1);
            if (command === 'state') this.carPlayState = snapshot;
            return snapshot;
        }
        if (command === 'reset') this.carPlayState = null;
    }

    async assertCarPlayState(expected) {
        let actual;
        await this.until(
            async () => {
                actual = await this.carPlayCommand('state');
                if (actual.errorText) throw new Error(actual.errorText);
                return carPlayStateMatches(actual, expected);
            },
            `CarPlay state ${JSON.stringify(expected)}; see metro.log for actual state`,
            45000,
        );
        return actual;
    }

    displayInput(command, points, shot) {
        const geometry = shot || {
            ...JSON.parse(this.run(this.hostBinary, ['geometry'])),
            width: this.displayWidth,
            height: this.displayHeight,
        };
        const values = points.flatMap(([x, y]) => {
            const point = getCarPlayTap(geometry, {
                x: x * geometry.width,
                y: y * geometry.height,
            });
            return [String(point.x), String(point.y)];
        });
        return this.run(this.hostBinary, [command, ...values]);
    }

    mapPixelDifference(first, second) {
        return JSON.parse(
            this.run(this.ocrBinary, [
                '--mean-pixel-difference',
                first.image,
                second.image,
                ...[
                    first.width * 0.35,
                    first.height * 0.2,
                    first.width * 0.3,
                    first.height * 0.4,
                ].map((value) => String(Math.round(value))),
            ]),
        );
    }

    async executeStep(step) {
        switch (step.type) {
            case 'setPrimaryLocations':
                return this.carPlayCommand('locations', {
                    locations: step.locations,
                });
            case 'openDashboard': {
                return this.until(
                    async () => {
                        const shot = this.capture('dashboard-ready');
                        if (
                            shot.observations.some(
                                ({ text, y }) =>
                                    normalizeOCRText(text) === 'search' &&
                                    y > shot.height * 0.55,
                            )
                        ) {
                            return true;
                        }
                        this.run(this.hostBinary, ['home']);
                        await wait(900);
                        return false;
                    },
                    'CarPlay Dashboard shortcuts',
                    20000,
                );
            }
            case 'assertMapAppearanceChanged': {
                const first = this.screenshots.get(step.before);
                return this.until(
                    () =>
                        this.mapPixelDifference(
                            first,
                            this.capture(step.after),
                        ) > 0.02,
                    `visible map appearance change from ${step.before} to ${step.after}`,
                    20000,
                );
            }
            case 'assertNavigationUI': {
                let failure;
                await this.until(
                    async () => {
                        const state = await this.carPlayCommand('state');
                        const shot = this.capture(step.name);
                        failure = getCarPlayNavigationUIFailure(
                            shot,
                            state.maneuverText,
                        );
                        if (failure) await wait(1200);
                        return failure === null;
                    },
                    'native turn guidance and arrival estimates',
                    20000,
                );
                return;
            }
            case 'waitForMetro':
                return this.marker(
                    step.marker,
                    this.scenarioOffset || 0,
                    45000,
                );
            case 'armVoiceTranscript':
                return this.carPlayCommand('voice', {
                    transcript: step.transcript,
                });
            case 'captureRouteOverviewBaseline':
                this.routeOverviewBaseline = await captureRouteOverviewBaseline(
                    () => this.carPlayCommand('route-render'),
                );
                return;
            case 'assertRouteOverview':
                return assertRouteOverview({
                    name: step.name,
                    baseline: this.routeOverviewBaseline,
                    sample: () => this.carPlayCommand('route-render'),
                    capture: (name) => this.capture(name),
                    appBounds: (shot) => ({
                        x: 0,
                        y: 0,
                        width: shot.width,
                        height: shot.height,
                    }),
                    directory: this.directory,
                    report: (message) => this.report(message),
                    runPixelProbe: (shot, probe) => {
                        const file = join(
                            this.directory,
                            `${step.name}-pixel-probe.json`,
                        );
                        writeFileSync(file, JSON.stringify(probe));
                        return JSON.parse(
                            this.run(this.ocrBinary, [
                                '--route-pixels',
                                shot.image,
                                file,
                            ]),
                        );
                    },
                });
            case 'assertCarPlayState':
                return this.assertCarPlayState(step.expected);
            case 'tapIcon': {
                if (step.waitForMetro) {
                    const offset = this.metroOutput.length;
                    let attempts = 0;
                    await this.until(
                        async () => {
                            if (
                                this.metroOutput
                                    .slice(offset)
                                    .includes(step.waitForMetro)
                            )
                                return true;
                            if (attempts >= 3) return false;
                            attempts++;
                            await this.executeStep({
                                ...step,
                                waitForMetro: null,
                            });
                            await wait(1000);
                            return this.metroOutput
                                .slice(offset)
                                .includes(step.waitForMetro);
                        },
                        `native ${step.name} button action`,
                        10000,
                    );
                    return;
                }
                if (step.expectText) {
                    let attempts = 0;
                    await this.until(
                        async () => {
                            const shot = this.capture(`opened-${step.name}`);
                            if (
                                matchesCarPlayText(shot.observations, {
                                    contains: step.expectText,
                                })
                            )
                                return true;
                            if (
                                attempts >= 3 ||
                                (this.carPlayState?.isNavigating &&
                                    !matchesCarPlayText(shot.observations, {
                                        contains: ['arrival'],
                                    }))
                            )
                                return false;
                            attempts++;
                            await this.executeStep({
                                ...step,
                                expectText: null,
                            });
                            await wait(350);
                            return false;
                        },
                        `native ${step.name} panel`,
                        20000,
                    );
                    return;
                }
                const shot = this.capture(`before-${step.name}`);
                const maneuver = normalizeOCRText(
                    this.carPlayState?.maneuverText || '',
                );
                const headerIsVisible = shot.observations?.some(
                    ({ text, y }) => {
                        const fragment = normalizeOCRText(text);
                        return (
                            fragment.length > 4 &&
                            maneuver.includes(fragment) &&
                            y > shot.width * 0.14
                        );
                    },
                );
                if (this.carPlayState?.isNavigating && !headerIsVisible) {
                    // Reveal at the top edge, then tap without a slow screenshot
                    // in between that could let CarPlay hide the header again.
                    this.displayInput('tap', [[0.65, 0.035]], shot);
                    await wait(300);
                }
                const point = getCarPlayIconPoint(shot, step.name);
                return this.displayInput(
                    'tap',
                    [[point.x / shot.width, point.y / shot.height]],
                    shot,
                );
            }
            case 'dragDisplay':
                return this.displayInput('drag', [step.from, step.to]);
            case 'hostBack':
                this.run(this.hostBinary, ['back']);
                return wait(350);
            case 'submitSearch': {
                const keyboard = this.capture('keyboard-submit');
                const [point] = getCarPlayKeyboardPoints(keyboard, '');
                return this.displayInput(
                    'tap',
                    [[point.x / keyboard.width, point.y / keyboard.height]],
                    keyboard,
                );
            }
            case 'enterSearchText':
                this.displayInput('tap', [
                    [0.43, (this.displayWidth * 0.037) / this.displayHeight],
                ]);
                {
                    const keyboard = this.capture('keyboard-ready');
                    if (
                        !matchesCarPlayText(keyboard.observations, {
                            contains: ['123'],
                        })
                    )
                        throw new Error('CarPlay keyboard is not visible');
                    const points = getCarPlayKeyboardPoints(
                        keyboard,
                        step.text,
                        { submit: step.submit !== false },
                    );
                    this.displayInput(
                        'tap-sequence',
                        points.map(({ x, y }) => [
                            x / keyboard.width,
                            y / keyboard.height,
                        ]),
                        keyboard,
                    );
                }
                return;
            case 'assertMapMoved': {
                const first = this.screenshots.get(step.before);
                const second = this.screenshots.get(step.after);
                const difference = this.mapPixelDifference(first, second);
                if (!(difference > 0.005))
                    throw new Error(
                        `Map did not visibly move: ${JSON.stringify(difference)}`,
                    );
                return;
            }
            case 'routeCheckpoint':
                return this.waitForRouteTime(step.atMs);
            case 'sleep':
                return wait(step.milliseconds);
            case 'screenshot':
                return this.capture(step.name);
            case 'assertOcr':
                return this.assertText(step);
            case 'tapOcr':
                return this.tapText(step);
            case 'assertPresenceReports':
                return assertReportProof(
                    this.metroOutput.slice(this.reportOffset),
                    step.count,
                    step.osmNodeId,
                    this.queueBaseline,
                );
            case 'assertConfirmationCameraStable': {
                const proof = readMarkers(
                    this.metroOutput.slice(this.cameraOffset),
                    '[E2E] presence-camera-released ',
                ).at(-1);
                const failure =
                    getConfirmationCameraStabilityAssertionFailure(proof);
                if (failure) throw new Error(failure);
                return;
            }
            default:
                throw new Error(`Unsupported CarPlay step: ${step.type}`);
        }
    }

    async prepare() {
        if (process.platform !== 'darwin')
            throw new Error('CarPlay Simulator tests require macOS');
        mkdirSync(this.directory, { recursive: true });
        this.hostBinary = join(this.directory, 'carplay-host');
        this.ocrBinary = join(this.directory, 'carplay-ocr');
        // These are macOS test utilities; no iOS or Android build is generated.
        for (const [source, binary] of [
            ['carplay-e2e-host.swift', this.hostBinary],
            ['android-auto-ocr.swift', this.ocrBinary],
        ]) {
            this.run(
                'xcrun',
                ['swiftc', join(SCRIPT_DIRECTORY, source), '-o', binary],
                { timeout: 60000 },
            );
        }
        this.run(this.hostBinary, ['check']);
        this.udid = selectUSBDevice(
            JSON.parse(this.pmd(['usbmux', 'list'])),
            this.environment.CARPLAY_E2E_UDID,
        );
        const interfaces = Object.values(networkInterfaces()).flat();
        const host =
            this.environment.CARPLAY_E2E_HOST ||
            interfaces.find(
                (item) =>
                    item.family === 'IPv4' &&
                    !item.internal &&
                    !item.address.startsWith('169.254.'),
            )?.address;
        if (!host)
            throw new Error('Set CARPLAY_E2E_HOST to this Mac’s LAN address');
        await new Promise((done, reject) => {
            const server = net.createServer();
            server.once('error', reject);
            server.listen(this.port, '0.0.0.0', () => server.close(done));
        });
        this.metro = spawn('npx', getCarPlayMetroArgs(this.port), {
            cwd: EXPO_DIRECTORY,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...this.environment,
                APP_ENV: 'e2e',
                ENABLE_CARPLAY: '1',
                CI: '1',
                EXPO_PUBLIC_E2E_MAP_API_MOCKS: '0',
                FORCE_COLOR: '0',
            },
        });
        this.metro.on('error', (error) => {
            this.processError = error;
        });
        this.metro.on('exit', (code) => {
            if (!this.cleaning)
                this.processError = new Error(`Managed Metro exited: ${code}`);
        });
        for (const stream of [this.metro.stdout, this.metro.stderr])
            stream.on('data', (chunk) => {
                this.metroOutput += chunk;
                appendFileSync(join(this.directory, 'metro.log'), chunk);
            });
        await this.until(
            async () => {
                try {
                    return (await fetch(`http://127.0.0.1:${this.port}/status`))
                        .ok;
                } catch {
                    return false;
                }
            },
            'managed Metro',
            60000,
        );
        this.launchURL(
            `exp+driversagainstflock://expo-development-client/?url=${encodeURIComponent(`http://${host}:${this.port}`)}`,
            { restart: true },
        );
        await this.marker('[E2E] phone-root-mounted', 0, 120000);
        this.queueBaseline = await this.resetDrive();
        this.reportOffset = this.metroOutput.length;
        await this.ensureCarPlayMap();
    }

    async startDrive(name) {
        this.currentDrive = name;
        this.gpsMessages = [];
        this.closingGPS = false;
        this.gps = spawn(
            'uv',
            [
                'run',
                '--no-project',
                '--with',
                'pymobiledevice3==11.45.0',
                'python',
                join(SCRIPT_DIRECTORY, 'carplay-gpx.py'),
                GPX_FILE,
                this.udid,
            ],
            { env: this.environment, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        const gps = this.gps;
        this.gps.on('error', (error) => {
            this.processError = error;
        });
        this.gps.stdin.on('error', (error) => {
            if (!this.cleaning) this.processError = error;
        });
        this.gps.on('exit', (code) => {
            if (!this.cleaning && !this.closingGPS && this.gps === gps)
                this.processError = new Error(`GPS driver exited: ${code}`);
        });
        this.gps.stderr.on('data', (chunk) =>
            appendFileSync(join(this.directory, 'gps.log'), chunk),
        );
        createInterface({ input: this.gps.stdout }).on('line', (line) => {
            if (this.gps !== gps) return;
            appendFileSync(
                join(this.directory, 'gpx-progress.jsonl'),
                `${line}\n`,
            );
            try {
                this.gpsMessages.push(JSON.parse(line));
            } catch {
                appendFileSync(join(this.directory, 'gps.log'), `${line}\n`);
            }
        });
        await this.until(
            () => this.gpsMessages.some((message) => message.ready),
            'USB GPS driver',
            30000,
        );
        this.routeDurationMs = this.gpsMessages.find(
            (message) => message.ready,
        ).durationMs;
        this.report(
            `Starting complete GPX drive: ${name} (0-${this.routeDurationMs} ms)`,
        );
        await this.gpsRequest({ command: 'start' });
    }

    async finishDrive() {
        await this.until(
            () => this.gpsMessages.some((message) => message.completed),
            'complete start-to-finish GPX playback',
            this.routeDurationMs + 60000,
        );
        const ready = this.gpsMessages.find((message) => message.ready);
        const completed = this.gpsMessages.find((message) => message.completed);
        if (
            completed.atMs !== ready.durationMs ||
            completed.fixes !== ready.points
        )
            throw new Error('GPX player did not complete the entire file');
        this.report(
            `Completed full GPX drive: ${this.currentDrive} (${completed.fixes} fixes, ${completed.atMs} ms route, ${completed.elapsedMs} ms elapsed)`,
        );
        await this.closeGPS();
    }

    async closeGPS() {
        if (!this.gps) return;
        this.closingGPS = true;
        const gps = this.gps;
        try {
            if (gps.exitCode !== null || gps.stdin.destroyed)
                throw new Error('GPS driver stopped');
            gps.stdin.end(`${JSON.stringify({ command: 'close' })}\n`);
            const deadline = Date.now() + 15000;
            while (!this.gpsMessages.some((message) => message.closed)) {
                if (Date.now() > deadline || gps.exitCode !== null)
                    throw new Error('GPS cleanup not acknowledged');
                await wait(100);
            }
        } catch {
            gps.kill('SIGTERM');
            this.pmd([
                'developer',
                'dvt',
                'simulate-location',
                'clear',
                '--userspace',
                '--udid',
                this.udid,
            ]);
        } finally {
            this.gps = null;
            this.closingGPS = false;
        }
    }

    async cleanup() {
        if (this.cleanupPromise) return this.cleanupPromise;
        this.cleanupPromise = (async () => {
            this.cleaning = true;
            if (this.stationaryPrepared && this.metro?.exitCode === null) {
                try {
                    await this.carPlayCommand('locations', {
                        locations: 'both',
                    });
                    await this.carPlayCommand('reset');
                } catch (error) {
                    this.report(`CarPlay UI cleanup: ${error.message}`);
                }
            }
            await this.closeGPS();
        })().finally(() => {
            if (this.metro?.pid) {
                try {
                    process.kill(-this.metro.pid, 'SIGTERM');
                } catch {}
            }
        });
        return this.cleanupPromise;
    }

    async execute() {
        let drive = null;
        try {
            await this.prepare();
            for (const scenario of this.suite) {
                if (scenario.stationary) {
                    if (drive !== null) {
                        await this.finishDrive();
                        drive = null;
                    }
                    if (!this.stationaryPrepared) {
                        await this.carPlayCommand('seed');
                        this.stationaryPrepared = true;
                    }
                    await this.carPlayCommand('reset');
                } else if (scenario.drive !== drive) {
                    if (drive !== null) await this.finishDrive();
                    await this.resetDrive();
                    await this.startDrive(scenario.drive);
                    drive = scenario.drive;
                }
                this.report(`RUN ${scenario.name}`);
                this.scenarioOffset = this.metroOutput.length;
                try {
                    for (const step of scenario.steps)
                        await this.executeStep(step);
                    this.results.push({ name: scenario.name, passed: true });
                    this.report(`PASS ${scenario.name}`);
                } catch (error) {
                    this.results.push({
                        name: scenario.name,
                        passed: false,
                        error: error.message,
                    });
                    try {
                        this.capture('failure');
                    } catch {}
                    throw error;
                }
            }
            if (drive !== null) await this.finishDrive();
        } catch (error) {
            if (drive !== null && this.gps && !this.processError) {
                this.report(
                    'Assertion failed; allowing the GPX player to finish the complete route',
                );
                try {
                    await this.finishDrive();
                } catch (completionError) {
                    this.report(
                        `GPX completion failed: ${completionError.message}`,
                    );
                }
            }
            throw error;
        } finally {
            try {
                await this.cleanup();
            } finally {
                mkdirSync(this.directory, { recursive: true });
                writeFileSync(
                    join(this.directory, 'results.json'),
                    JSON.stringify(this.results, null, 2),
                );
            }
        }
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const runner = new CarPlayRunner();
    if (process.argv.includes('--list')) {
        for (const scenario of runner.suite) console.log(scenario.name);
    } else if (process.argv.includes('--help')) {
        console.log(
            'npm run e2e:carplay [-- --list] runs all cases.\nnpm run e2e:carplay:ui runs the stationary controls, saved-place and search cases without GPX.\nnpm run e2e:carplay:route-choices runs route previews with native camera-fit and visible-line assertions.\nnpm run e2e:carplay:alpr runs the complete GPX driving cases.\nVoice UI cases use fixed transcripts; search and directions use live APIs.\nnpm run carplay:screenshot -- /tmp/carplay.png captures the CarPlay display without activating apps.\nRequires a USB iPhone with the CarPlay development app, a connected CarPlay Simulator, uv, and macOS Accessibility access for window-targeted background input. Input does not activate apps or move the desktop cursor; unsupported background input fails without a cursor fallback.\nOptional: CARPLAY_E2E_UDID, CARPLAY_E2E_HOST, CARPLAY_E2E_METRO_PORT, CARPLAY_E2E_ARTIFACTS_DIR, CARPLAY_E2E_SCENARIO, CARPLAY_E2E_SUITE (all/alpr/navigation/route-choices).',
        );
    } else if (process.argv.includes('--screenshot')) {
        runner.udid = selectUSBDevice(
            JSON.parse(runner.pmd(['usbmux', 'list'])),
            runner.environment.CARPLAY_E2E_UDID,
        );
        const destination = resolve(
            process.argv[process.argv.indexOf('--screenshot') + 1] ||
                join(tmpdir(), 'carplay.png'),
        );
        runner.takeDisplayScreenshot(destination);
        console.log(destination);
    } else {
        for (const signal of ['SIGINT', 'SIGTERM'])
            process.once(signal, () => {
                void runner.cleanup().then(
                    () => process.exit(130),
                    (error) => {
                        console.error(error);
                        process.exit(1);
                    },
                );
            });
        runner.execute().then(
            () =>
                console.log(
                    `CarPlay suite passed (${runner.results.length} scenarios). Artifacts: ${runner.directory}`,
                ),
            (error) => {
                console.error(
                    `${error.message}\nArtifacts: ${runner.directory}`,
                );
                process.exitCode = 1;
            },
        );
    }
}
