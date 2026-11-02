import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    readWatchCueEvidence,
    synchronizeWatchEmulatorClock,
    watchNavigationMatchesScenario,
} from '../watch-camera-e2e.mjs';

test('guided camera assertion requires active Walmart navigation', () => {
    assert.equal(
        watchNavigationMatchesScenario(
            {
                navigationStatus: 'active',
                destination: 'Walmart',
                routeSessionId: 'route-1',
            },
            true,
        ),
        true,
    );
    assert.equal(
        watchNavigationMatchesScenario(
            {
                navigationStatus: 'idle',
                destination: 'Walmart',
                routeSessionId: null,
            },
            true,
        ),
        false,
    );
    assert.equal(
        watchNavigationMatchesScenario(
            {
                navigationStatus: 'active',
                destination: 'Another store',
                routeSessionId: 'route-1',
            },
            true,
        ),
        false,
    );
});

test('watch emulator clock is corrected before cross-device cue timing', async () => {
    const calls = [];
    const execute = async (serial, args) => {
        calls.push([serial, args]);
        if (args[1] === 'date') {
            return serial === 'emulator-5554'
                ? '100000\n'
                : calls.filter(([, command]) => command[2] === 'time_detector')
                        .length
                  ? '100100\n'
                  : '1000\n';
        }
        if (args[1] === 'cat') return '12.345 50.000\n';
        return 'Suggestion injected';
    };
    assert.equal(
        await synchronizeWatchEmulatorClock(
            'emulator-5554',
            'emulator-5556',
            execute,
        ),
        true,
    );
    assert.ok(
        calls.some(
            ([, args]) =>
                args.includes('suggest_network_time') &&
                args.includes('12345') &&
                args.includes('100000'),
        ),
    );
});

test('free-drive watch evidence requires a camera waveform rather than a turn preview', () => {
    const snapshot = JSON.stringify({
        navigation: { status: 'idle' },
        cameraAlertsEnabled: true,
        cameraAlert: { id: 'mapped-alpr', sourceAt: Date.now() },
    });
    const xml = `<map><string name="snapshot">${snapshot.replaceAll('"', '&quot;')}</string><string name="last_cue_id">phone:camera:mapped-alpr:1000</string><string name="last_camera_cue_key">phone:mapped-alpr:1000</string></map>`;
    const vibration =
        'duration:   320ms | usage: TOUCH | com.anonymous.drivefree.dev (uid=10) | played: [Step=0ms,Step=60ms,Step=70ms]';
    const evidence = readWatchCueEvidence(
        xml,
        vibration,
        'com.anonymous.drivefree.dev',
    );
    assert.ok(
        evidence.cameraSourceAgeMs >= 0 && evidence.cameraSourceAgeMs < 1000,
    );
    delete evidence.cameraSourceAgeMs;
    assert.deepEqual(evidence, {
        navigationStatus: 'idle',
        destination: '',
        routeSessionId: null,
        cameraAlertId: 'mapped-alpr',
        cameraAlertsEnabled: true,
        lastCueId: 'phone:camera:mapped-alpr:1000',
        lastCameraCueKey: 'phone:mapped-alpr:1000',
        cameraVibrationRecord: vibration,
    });
    assert.equal(
        readWatchCueEvidence(
            xml,
            vibration.replace('320ms', '85ms'),
            'com.anonymous.drivefree.dev',
        ).cameraVibrationRecord,
        null,
    );
    assert.equal(
        readWatchCueEvidence(
            xml,
            `${vibration}\n${vibration.replace('320ms', '325ms')}`,
            'com.anonymous.drivefree.dev',
        ).cameraVibrationRecord,
        vibration.replace('320ms', '325ms'),
    );
});
