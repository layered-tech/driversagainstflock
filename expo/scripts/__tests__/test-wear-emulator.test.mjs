import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testWearEmulator } from '../test-wear-emulator.mjs';

function fixture({
    watches = ['emulator-5556'],
    environment = {},
    failTests = false,
} = {}) {
    const calls = [];
    return {
        calls,
        options: {
            environment,
            output: () => {},
            run(command, args, options) {
                calls.push({ command, args, options });
                if (args[0] === 'devices')
                    return {
                        status: 0,
                        stdout: 'List of devices attached\nemulator-5554 device model:Phone\nemulator-5556 device model:Watch\nemulator-5558 device model:Watch_2\nemulator-5560 offline model:Watch\n',
                    };
                if (args.includes('features'))
                    return {
                        status: 0,
                        stdout: watches.includes(args[1])
                            ? 'feature:android.hardware.type.watch\r\n'
                            : 'feature:android.hardware.camera\n',
                    };
                return { status: failTests ? 1 : 0 };
            },
        },
    };
}

test('automatically targets the running watch instead of the phone and forwards arguments', () => {
    const f = fixture();
    testWearEmulator({ ...f.options, extraArgs: ['--rerun-tasks'] });
    const gradle = f.calls.at(-1);
    assert.equal(gradle.options.env.ANDROID_SERIAL, 'emulator-5556');
    assert.equal(gradle.options.env.WEAR_BUILD_ENV, 'development');
    assert.equal(gradle.args[0], ':app:connectedDebugAndroidTest');
    assert.equal(gradle.args.at(-1), '--rerun-tasks');
    assert.ok(
        gradle.args.includes(
            '-Pandroid.testInstrumentationRunnerArguments.class=org.driversagainstflock.watch.WatchUiTest',
        ),
    );
});

test('does not launch Gradle when no watch or multiple watches are running', () => {
    for (const watches of [[], ['emulator-5556', 'emulator-5558']]) {
        const f = fixture({ watches });
        assert.throws(
            () => testWearEmulator(f.options),
            /No running|Multiple Wear OS/,
        );
        assert.equal(
            f.calls.some(
                (call) => call.args[0] === ':app:connectedDebugAndroidTest',
            ),
            false,
        );
    }
});

test('respects an explicit watch selection and rejects a phone selection', () => {
    const f = fixture({
        watches: ['emulator-5556', 'emulator-5558'],
        environment: { ANDROID_SERIAL: 'emulator-5558' },
    });
    testWearEmulator(f.options);
    assert.equal(f.calls.at(-1).options.env.ANDROID_SERIAL, 'emulator-5558');
    const phone = fixture({ environment: { ANDROID_SERIAL: 'emulator-5554' } });
    assert.throws(() => testWearEmulator(phone.options), /No running/);
});

test('reports a failed emulator test run', () => {
    const f = fixture({ failTests: true });
    assert.throws(() => testWearEmulator(f.options), /Wear OS UI tests failed/);
});
