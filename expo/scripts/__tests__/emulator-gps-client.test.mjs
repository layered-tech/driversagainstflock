import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    androidGpsMatchesRouteFix,
    createEmulatorGpsClient,
    findEmulatorGpsSettings,
    getAndroidGpsLocation,
} from '../emulator-gps-client.mjs';

const require = createRequire(import.meta.url);
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');

test('emulator discovery selects the requested device instead of another emulator', () => {
    const directory = mkdtempSync(join(tmpdir(), 'daf-gps-discovery-'));
    try {
        writeFileSync(
            join(directory, 'pid_1.ini'),
            'port.serial=5556\ngrpc.port=8556\ngrpc.token=other-token\n',
        );
        writeFileSync(
            join(directory, 'pid_2.ini'),
            'port.serial=5554\ngrpc.port=8554\ngrpc.token=test-token\n',
        );
        writeFileSync(
            join(directory, 'ignored.txt'),
            'port.serial=5554\ngrpc.port=1\n',
        );
        assert.equal(
            findEmulatorGpsSettings(directory, 'emulator-5554')['grpc.port'],
            '8554',
        );
        assert.throws(
            () => findEmulatorGpsSettings(directory, 'emulator-5558'),
            /No emulator GPS control endpoint/,
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('GPS delivery proof rejects a stationary provider despite successful injection acknowledgements', () => {
    const location = getAndroidGpsLocation(
        '    passive provider:\n last location=Location[gps 43.0,-88.0 vel=0.0 bear=0.0]\n    gps provider:\n      last location=Location[gps 43.119840,-88.244470 hAcc=5.0 et=+33m vel=18.6 sAcc=0.5 bear=180.0 bAcc=30.0]\n',
    );
    const fix = {
        latitude: 43.11984,
        longitude: -88.24447,
        speed: 18.6,
        heading: 180,
    };
    assert.deepEqual(location, {
        latitude: 43.11984,
        longitude: -88.24447,
        speed: 18.6,
        heading: 180,
    });
    assert.equal(androidGpsMatchesRouteFix(location, fix), true);
    for (const actual of [
        null,
        { ...location, latitude: 43.12152 },
        { ...location, speed: 0 },
        { ...location, heading: 0 },
    ]) {
        assert.equal(androidGpsMatchesRouteFix(actual, fix), false);
    }
    assert.equal(
        getAndroidGpsLocation('    gps provider:\n      last location=null'),
        null,
    );
    assert.equal(
        androidGpsMatchesRouteFix(
            { ...location, heading: 359 },
            { ...fix, heading: 1 },
        ),
        true,
    );
});

test('authenticated GPS RPC sends route motion and restores the original emulator settings', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'daf-gps-rpc-'));
    const androidSdkRoot =
        process.env.ANDROID_HOME ||
        join(homedir(), 'Library', 'Android', 'sdk');
    const schema = loader.loadSync(
        join(androidSdkRoot, 'emulator/lib/emulator_controller.proto'),
        { includeDirs: [join(androidSdkRoot, 'emulator/lib')] },
    );
    const Controller =
        grpc.loadPackageDefinition(schema).android.emulation.control
            .EmulatorController;
    const server = new grpc.Server();
    const original = {
        passiveUpdate: true,
        latitude: 37.422,
        longitude: -122.084,
        satellites: 1,
    };
    let state = original;
    const updates = [];
    server.addService(Controller.service, {
        getGps: (call, callback) => {
            assert.deepEqual(call.metadata.get('authorization'), [
                'Bearer test-token',
            ]);
            callback(null, state);
        },
        setGps: (call, callback) => {
            updates.push(call.request);
            state = call.request;
            callback(null, {});
        },
    });
    let client;
    try {
        const port = await new Promise((resolve, reject) =>
            server.bindAsync(
                '127.0.0.1:0',
                grpc.ServerCredentials.createInsecure(),
                (error, port) => (error ? reject(error) : resolve(port)),
            ),
        );
        writeFileSync(
            join(directory, 'pid_1.ini'),
            `port.serial=5554\ngrpc.port=${port}\ngrpc.token=test-token\n`,
        );
        client = await createEmulatorGpsClient({
            serial: 'emulator-5554',
            androidSdkRoot,
            discoveryDirectory: directory,
        });
        await client.setLocation({
            latitude: 43.11984,
            longitude: -88.24447,
            speed: 18.6,
            heading: 180,
        });
        assert.equal(updates[0].latitude, 43.11984);
        assert.equal(updates[0].longitude, -88.24447);
        assert.equal(updates[0].speed, 18.6 / 0.514444);
        assert.equal(updates[0].bearing, 180);
        assert.equal(updates[0].satellites, 8);
        assert.equal(Boolean(updates[0].passiveUpdate), false);
        await client.restore();
        assert.deepEqual(updates[1], original);
    } finally {
        client?.close();
        server.forceShutdown();
        rmSync(directory, { recursive: true, force: true });
    }
});
