import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    buildWatch,
    parseArguments,
    watchSimulators,
} from '../build-watch.mjs';

const phone = { name: 'iPhone', udid: 'phone', isAvailable: true };
const watch = { name: 'Apple Watch', udid: 'watch', isAvailable: true };
const inventory = {
    devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [phone],
        'com.apple.CoreSimulator.SimRuntime.watchOS-27-0': [watch],
    },
};

function fixture({
    devices = inventory,
    fail,
    pairs = { pair: { phone, watch } },
    exists = true,
    viewer = 'DeviceHub',
} = {}) {
    const calls = [];
    const messages = [];
    return {
        calls,
        messages,
        options: {
            environment: {
                DAF_EAS_LOCAL_BUILD_ROOT: '/Volumes/Build Disk/builds',
            },
            exists: (path) =>
                path.endsWith(`/${viewer}.app`) ||
                (path.endsWith('/DAFWatch.app') && exists),
            output: (message) => messages.push(message),
            run: (command, args) => {
                calls.push({ command, args });
                if (fail?.(command, args))
                    return { status: 7, stderr: 'fixture failure' };
                if (command === 'xcode-select')
                    return {
                        status: 0,
                        stdout: '/Applications/Selected Xcode.app/Contents/Developer\n',
                    };
                if (args.includes('devices'))
                    return { status: 0, stdout: JSON.stringify(devices) };
                if (args.includes('pairs'))
                    return { status: 0, stdout: JSON.stringify({ pairs }) };
                return { status: 0, stdout: '' };
            },
        },
    };
}

test('root npm commands expose both Apple Watch variants', () => {
    const { scripts } = JSON.parse(
        readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    );
    assert.equal(
        scripts['build:watch:dev'],
        'node ./expo/scripts/build-watch.mjs dev',
    );
    assert.equal(
        scripts['build:watch:staging'],
        'node ./expo/scripts/build-watch.mjs staging',
    );
});

test('only available watchOS 10+ devices can be selected', () => {
    assert.deepEqual(
        watchSimulators({
            devices: {
                ...inventory.devices,
                'com.apple.CoreSimulator.SimRuntime.watchOS-9-0': [
                    { ...watch, udid: 'old' },
                ],
                'com.apple.CoreSimulator.SimRuntime.watchOS-26-0': [
                    { ...watch, isAvailable: false },
                ],
            },
        }).map((device) => device.udid),
        ['watch'],
    );
});

for (const [profile, configuration, bundle] of [
    ['dev', 'Debug', 'com.anonymous.drivefree.dev'],
    ['staging', 'Release', 'com.anonymous.drivefree'],
]) {
    test(`${profile} builds matching identifiers and boots the paired phone before installing on the watch`, async () => {
        const f = fixture();
        await buildWatch({ ...f.options, args: [profile] });
        const build = f.calls.find((call) => call.command === 'bash');
        assert.equal(
            build.args[build.args.indexOf('-configuration') + 1],
            configuration,
        );
        assert.ok(build.args.includes('watchsimulator'));
        assert.ok(build.args.includes('platform=watchOS Simulator,id=watch'));
        assert.ok(build.args.includes(`DAF_PHONE_BUNDLE_IDENTIFIER=${bundle}`));
        assert.ok(build.args.includes(`DAF_APP_GROUP=group.${bundle}.watch`));
        assert.ok(build.args.includes('CODE_SIGNING_ALLOWED=NO'));
        const products = `/Volumes/Build Disk/builds/watch-simulator/${profile}`;
        assert.ok(build.args.includes(`CONFIGURATION_BUILD_DIR=${products}`));
        assert.deepEqual(
            f.calls.slice(-5).map((call) => call.args),
            [
                ['simctl', 'bootstatus', 'phone', '-b'],
                ['simctl', 'bootstatus', 'watch', '-b'],
                [
                    '-a',
                    '/Applications/Selected Xcode.app/Contents/Applications/DeviceHub.app',
                ],
                ['simctl', 'install', 'watch', `${products}/DAFWatch.app`],
                [
                    'simctl',
                    'launch',
                    '--terminate-running-process',
                    'watch',
                    `${bundle}.watchkitapp`,
                ],
            ],
        );
    });
}

test('older Xcode opens its bundled Simulator and selects the watch', async () => {
    const f = fixture({ viewer: 'Simulator' });
    await buildWatch({ ...f.options, args: ['dev'] });
    assert.deepEqual(f.calls.find((call) => call.command === 'open').args, [
        '-a',
        '/Applications/Selected Xcode.app/Contents/Developer/Applications/Simulator.app',
        '--args',
        '-CurrentDeviceUDID',
        'watch',
    ]);
});

test('missing simulator viewer stops before a native build', async () => {
    const f = fixture({ viewer: 'Missing' });
    await assert.rejects(
        buildWatch({ ...f.options, args: ['dev'] }),
        /Device Hub or Simulator/,
    );
    assert.equal(
        f.calls.some((call) => call.command === 'bash'),
        false,
    );
});

test('build-only works without simulator discovery or installation', async () => {
    const f = fixture();
    await buildWatch({ ...f.options, args: ['staging', '--build-only'] });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].command, 'bash');
    assert.ok(f.calls[0].args.includes('generic/platform=watchOS Simulator'));
});

test('interactive selection and explicit UDID target the chosen watch', async () => {
    const secondWatch = { ...watch, udid: 'second', name: 'Second watch' };
    const devices = {
        devices: {
            ...inventory.devices,
            'com.apple.CoreSimulator.SimRuntime.watchOS-27-0': [
                watch,
                secondWatch,
            ],
        },
    };
    for (const flags of [[], ['--simulator', 'second']]) {
        const f = fixture({ devices });
        await buildWatch({
            ...f.options,
            args: ['dev', ...flags],
            ask: async () => {
                assert.equal(
                    f.calls.some((call) => call.command === 'bash'),
                    false,
                );
                return '2';
            },
        });
        assert.deepEqual(f.calls.at(-1).args.slice(0, 4), [
            'simctl',
            'launch',
            '--terminate-running-process',
            'second',
        ]);
    }
});

test('bad selections and missing runtimes stop before building', async () => {
    for (const [args, devices, error] of [
        [['dev'], { devices: {} }, /No available watchOS/],
        [
            ['dev', '--simulator', 'phone'],
            inventory,
            /Select a listed Apple Watch/,
        ],
    ]) {
        const f = fixture({ devices });
        await assert.rejects(buildWatch({ ...f.options, args }), error);
        assert.equal(
            f.calls.some((call) => call.command === 'bash'),
            false,
        );
    }
});

test('build failure or missing artifact never boots or installs', async () => {
    for (const settings of [
        { fail: (command) => command === 'bash' },
        { exists: false },
    ]) {
        const f = fixture(settings);
        await assert.rejects(
            buildWatch({ ...f.options, args: ['dev'] }),
            /build failed|did not create/,
        );
        assert.equal(
            f.calls.some(
                (call) =>
                    call.args.includes('bootstatus') ||
                    call.args.includes('install'),
            ),
            false,
        );
    }
});

test('installation failure does not launch, and discovery errors propagate', async () => {
    for (const operation of ['devices', 'pairs', 'bootstatus', 'install']) {
        const f = fixture({ fail: (_, args) => args.includes(operation) });
        await assert.rejects(
            buildWatch({ ...f.options, args: ['dev'] }),
            /fixture failure/,
        );
        assert.equal(
            f.calls.some((call) => call.args.includes('launch')),
            false,
        );
    }
});

test('help and invalid arguments cannot trigger native commands', async () => {
    const f = fixture();
    await buildWatch({ ...f.options, args: ['dev', '--help'] });
    assert.equal(f.calls.length, 0);
    for (const args of [
        [],
        ['production'],
        ['dev', '--simulator'],
        ['dev', '--bad'],
        ['dev', '--build-only', '--simulator', 'watch'],
    ]) {
        assert.throws(() => parseArguments(args), /Usage:|without a simulator/);
    }
});
