import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    Runner,
    builtInDisplayHasState,
    childProcessIsRunning,
    currentAutoPlayWakeLockIsHeld,
    envFileHasNonEmptyValue,
    findNodeBounds,
    getOCRAssertionFailure,
    normalizeOCRText,
    parseAdbForwardList,
    tcpDumpHasListeningPort,
} from '../android-auto-e2e.mjs';

describe('Android Auto E2E helpers', () => {
    test('finds semantic Android Auto menu nodes', () => {
        const xml = `
            <node text="" content-desc="More options" bounds="[1224,183][1344,327]" />
            <node text="Start head unit server" content-desc="" bounds="[804,675][1296,748]" />
        `;

        assert.deepEqual(findNodeBounds(xml, 'Start head unit server'), {
            bottom: 748,
            centerX: 1050,
            centerY: 712,
            left: 804,
            right: 1296,
            top: 675,
        });
        assert.equal(findNodeBounds(xml, 'Developer settings'), null);
    });

    test('normalizes OCR across host line wrapping', () => {
        assert.equal(
            normalizeOCRText('Turn right to avoid\nmonitored intersections'),
            'turn right to avoid monitored intersections',
        );
    });

    test('supports positive and negative OCR lifecycle assertions', () => {
        const ocr = 'Congress Avenue\nSPEED LIMIT';

        assert.equal(
            getOCRAssertionFailure(ocr, {
                contains: ['Congress Avenue'],
                notContains: ['Turn right'],
            }),
            null,
        );
        assert.equal(
            getOCRAssertionFailure(ocr, { contains: ['Search results'] }),
            'Missing "Search results"',
        );
        assert.equal(
            getOCRAssertionFailure(ocr, { notContains: ['speed limit'] }),
            'Unexpected "speed limit"',
        );
    });

    test('requires a non-empty Mapbox token without exposing its value', () => {
        assert.equal(
            envFileHasNonEmptyValue(
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.example-secret',
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            ),
            true,
        );
        assert.equal(
            envFileHasNonEmptyValue(
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=""',
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            ),
            false,
        );
        assert.equal(
            envFileHasNonEmptyValue(
                'EXPO_PUBLIC_OTHER=value',
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            ),
            false,
        );
    });

    test('ignores historical wake-lock events', () => {
        assert.equal(
            currentAutoPlayWakeLockIsHeld(
                "  PARTIAL_WAKE_LOCK 'AutoPlay:AndroidAutoSession' ACQ=-2m",
            ),
            true,
        );
        assert.equal(
            currentAutoPlayWakeLockIsHeld(
                '  08-05 20:56 - ACQ AutoPlay:AndroidAutoSession (partial)',
            ),
            false,
        );
    });

    test('distinguishes running children from signal-terminated children', () => {
        assert.equal(
            childProcessIsRunning({ exitCode: null, signalCode: null }),
            true,
        );
        assert.equal(
            childProcessIsRunning({ exitCode: null, signalCode: 'SIGTERM' }),
            false,
        );
        assert.equal(
            childProcessIsRunning({ exitCode: 0, signalCode: null }),
            false,
        );
    });

    test('only recognizes a local TCP listener for the head-unit port', () => {
        const tcpDump = `
          sl  local_address rem_address   st tx_queue rx_queue
           0: 0000000000000000FFFF00000100007F:149D 0000000000000000FFFF00000100007F:CAFE 06 00000000:00000000
           1: 0000000000000000FFFF00000100007F:CAFE 0000000000000000FFFF00000100007F:149D 01 00000000:00000000
           2: 00000000000000000000000000000000:149D 00000000000000000000000000000000:0000 0A 00000000:00000000
        `;

        assert.equal(tcpDumpHasListeningPort(tcpDump, 5277), true);
        assert.equal(
            tcpDumpHasListeningPort(
                tcpDump.replace(
                    '00000000000000000000000000000000:149D',
                    '00000000000000000000000000000000:CAFE',
                ),
                5277,
            ),
            false,
        );
    });

    test('reads the physical phone display independently of car displays', () => {
        const displayDump = `
            DisplayDeviceInfo{"Built-in Screen": state OFF, committedState OFF, type INTERNAL}
            DisplayDeviceInfo{"GhostActivityDisplay": state ON, committedState ON, type VIRTUAL}
        `;

        assert.equal(builtInDisplayHasState(displayDump, 'OFF'), true);
        assert.equal(builtInDisplayHasState(displayDump, 'ON'), false);
    });

    test('parses ADB forwards so pre-existing ownership can be preserved', () => {
        assert.deepEqual(
            parseAdbForwardList(`
                emulator-5554 tcp:5277 tcp:5277
                emulator-5556 tcp:9876 localabstract:service
            `),
            [
                {
                    local: 'tcp:5277',
                    remote: 'tcp:5277',
                    serial: 'emulator-5554',
                },
                {
                    local: 'tcp:9876',
                    remote: 'localabstract:service',
                    serial: 'emulator-5556',
                },
            ],
        );
    });

    test('loads the app through the development-client URL before DHU connects', () => {
        const commands = [];
        const runner = Object.create(Runner.prototype);
        runner.metroOutput = 'existing output';
        runner.suite = {
            appId: 'com.example.dev',
            metro: { host: '10.0.2.2', port: 8091 },
        };
        runner.report = () => {};
        runner.adb = (args) => {
            commands.push(args);

            if (args.includes('force-stop')) {
                runner.metroOutput += ' stale shutdown output';
            }
        };

        const outputStart = runner.restartAppWithDevelopmentClient(1);

        assert.equal(outputStart, runner.metroOutput.length);
        assert.deepEqual(commands[0], [
            'shell',
            'am',
            'force-stop',
            'com.example.dev',
        ]);
        assert.deepEqual(commands[1], [
            'shell',
            'am',
            'start',
            '-W',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            'exp+driversagainstflock://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8091',
            'com.example.dev',
        ]);
        assert.equal(runner.startedApp, true);
    });

    test('does not retry a successful development-client launch', async () => {
        const attempts = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return 100;
        };
        runner.waitForDevelopmentClient = async () => {};

        assert.equal(await runner.launchApp(), 100);
        assert.deepEqual(attempts, [1]);
    });

    test('retries a failed development-client launch once', async () => {
        const attempts = [];
        const readinessChecks = [];
        const reports = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return attempt * 100;
        };
        runner.waitForDevelopmentClient = async (outputStart, timeout) => {
            readinessChecks.push({ outputStart, timeout });

            if (readinessChecks.length === 1) {
                throw new Error('car service won the startup race');
            }
        };
        runner.report = (message) => reports.push(message);
        runner.metroProcess = { exitCode: null, signalCode: null };

        assert.equal(await runner.launchApp(), 200);

        assert.deepEqual(attempts, [1, 2]);
        assert.deepEqual(readinessChecks, [
            { outputStart: 100, timeout: 45000 },
            { outputStart: 200, timeout: 120000 },
        ]);
        assert.match(reports[0], /attempt 1 failed; retrying/);
    });

    test('stops after two failed development-client launches and preserves both errors', async () => {
        const attempts = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return attempt;
        };
        runner.waitForDevelopmentClient = async () => {
            throw new Error(`failure ${attempts.length}`);
        };
        runner.report = () => {};
        runner.metroProcess = { exitCode: null, signalCode: null };

        await assert.rejects(
            runner.launchApp(),
            (error) =>
                error instanceof AggregateError &&
                error.errors.map((cause) => cause.message).join(',') ===
                    'failure 1,failure 2',
        );
        assert.deepEqual(attempts, [1, 2]);
    });

    test('does not retry when managed Metro has stopped', async () => {
        const attempts = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return attempt;
        };
        runner.waitForDevelopmentClient = async () => {
            runner.metroProcess.exitCode = 1;
            throw new Error('Metro stopped');
        };
        runner.metroProcess = { exitCode: null, signalCode: null };

        await assert.rejects(runner.launchApp(), /Metro stopped/);
        assert.deepEqual(attempts, [1]);
    });

    test('requires the connected car service and rendered map', async () => {
        const markers = [];
        const runner = Object.create(Runner.prototype);
        runner.dhuProcess = { exitCode: null, signalCode: null };
        runner.dhuProcessError = null;
        runner.serviceRunning = () => true;
        runner.wakeLockHeld = () => true;
        runner.waitFor = async (predicate) =>
            assert.equal(await predicate(), true);
        runner.waitForMetroMarker = async (...args) => markers.push(args);

        await runner.waitForCarAppReady(321);

        assert.deepEqual(markers, [
            ['Running "AutoPlayRoot"', 321, 60000],
            ['[Android Auto] map-loaded', 321, 60000],
        ]);
    });
});
