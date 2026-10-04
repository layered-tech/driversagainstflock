import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');

export function findEmulatorGpsSettings(directory, serial) {
    for (const name of readdirSync(directory).filter((name) =>
        /^pid_\d+\.ini$/.test(name),
    )) {
        const settings = Object.fromEntries(
            readFileSync(join(directory, name), 'utf8')
                .split('\n')
                .filter((line) => line.includes('='))
                .map((line) => {
                    const index = line.indexOf('=');
                    return [
                        line.slice(0, index).trim(),
                        line.slice(index + 1).trim(),
                    ];
                }),
        );
        if (`emulator-${settings['port.serial']}` === serial) return settings;
    }
    throw new Error(`No emulator GPS control endpoint found for ${serial}.`);
}

export function getEmulatorRouteGpsState(fix) {
    return {
        passiveUpdate: false,
        latitude: fix.latitude,
        longitude: fix.longitude,
        // The emulator's GPS agent consumes knots despite the protobuf's m/s comment.
        speed: fix.speed / 0.514444,
        bearing: fix.heading,
        altitude: 0,
        satellites: 8,
    };
}

export function getAndroidGpsLocation(output) {
    const provider = String(output).split('    gps provider:')[1];
    const location = provider?.match(
        /last location=Location\[gps (-?[\d.]+),(-?[\d.]+)([^\]]*)\]/,
    );
    if (!location) return null;
    return {
        latitude: Number(location[1]),
        longitude: Number(location[2]),
        speed: Number(location[3].match(/\bvel=([\d.]+)/)?.[1]),
        heading: Number(location[3].match(/\bbear=([\d.]+)/)?.[1]),
    };
}

export function androidGpsMatchesRouteFix(actual, expected) {
    const headingDelta = Math.abs(
        ((actual?.heading - expected.heading + 540) % 360) - 180,
    );
    return Boolean(
        actual &&
        Math.abs(actual.latitude - expected.latitude) < 0.00003 &&
        Math.abs(actual.longitude - expected.longitude) < 0.00003 &&
        Math.abs(actual.speed - expected.speed) < 0.5 &&
        headingDelta < 5,
    );
}

export async function createEmulatorGpsClient({
    serial,
    androidSdkRoot,
    discoveryDirectory = join(
        homedir(),
        'Library',
        'Caches',
        'TemporaryItems',
        'avd',
        'running',
    ),
}) {
    const settings = findEmulatorGpsSettings(discoveryDirectory, serial);
    const schema = loader.loadSync(
        join(androidSdkRoot, 'emulator', 'lib', 'emulator_controller.proto'),
        { includeDirs: [join(androidSdkRoot, 'emulator', 'lib')] },
    );
    const Controller =
        grpc.loadPackageDefinition(schema).android.emulation.control
            .EmulatorController;
    const client = new Controller(
        `127.0.0.1:${settings['grpc.port']}`,
        grpc.credentials.createInsecure(),
    );
    const metadata = new grpc.Metadata();
    if (settings['grpc.token'])
        metadata.set('authorization', `Bearer ${settings['grpc.token']}`);
    const call = (method, value) =>
        new Promise((resolve, reject) =>
            client[method](
                value,
                metadata,
                { deadline: Date.now() + 5000 },
                (error, result) => (error ? reject(error) : resolve(result)),
            ),
        );
    try {
        const original = await call('getGps', {});
        return {
            setLocation: (fix) => call('setGps', getEmulatorRouteGpsState(fix)),
            restore: () => call('setGps', original),
            close: () => client.close(),
        };
    } catch (error) {
        client.close();
        throw error;
    }
}
