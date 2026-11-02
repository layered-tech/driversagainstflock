import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const usage = `Usage: npm run build:watch:dev|staging -- [--simulator UDID] [--build-only]

Builds the native Apple Watch app for the simulator, then installs and launches it.
Choose an available Watch simulator interactively, or pass --simulator UDID.
--build-only builds without starting a simulator or installing the app.
Dev uses Debug and the development phone bundle; staging uses Release and the staging phone bundle.
The matching iPhone app must already be installed on the paired iPhone simulator
for live data. These commands do not build the phone or start Metro.
Native build storage uses DAF_EAS_LOCAL_BUILD_ROOT (the existing external Xcode wrapper).
These are simulator builds; they do not produce a device archive or TestFlight IPA.`;

export function parseArguments(args) {
    const [profile, ...flags] = args;
    if (!['dev', 'staging'].includes(profile)) throw new Error(usage);
    const options = { profile, buildOnly: false, simulator: undefined };
    for (let index = 0; index < flags.length; index += 1) {
        const flag = flags[index];
        if (flag === '--build-only') options.buildOnly = true;
        else if (flag === '--help' || flag === '-h') options.help = true;
        else if (
            flag === '--simulator' &&
            flags[index + 1] &&
            !flags[index + 1].startsWith('-')
        ) {
            options.simulator = flags[++index];
        } else throw new Error(usage);
    }
    if (options.buildOnly && options.simulator)
        throw new Error(
            'Use --simulator for installation, or --build-only without a simulator.',
        );
    return options;
}

export function watchSimulators(inventory) {
    return Object.entries(inventory.devices ?? {}).flatMap(
        ([runtime, devices]) => {
            const version = runtime.match(/\.watchOS-(\d+)/);
            if (!version || Number(version[1]) < 10) return [];
            return devices
                .filter((device) => device.isAvailable === true)
                .map((device) => ({ ...device, runtime }));
        },
    );
}

async function askSimulator() {
    if (!process.stdin.isTTY)
        throw new Error(
            'Multiple Watch simulators found. Pass --simulator UDID.',
        );
    const prompt = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        return await prompt.question(
            'Run on which Apple Watch simulator? Enter its number: ',
        );
    } finally {
        prompt.close();
    }
}

export async function buildWatch({
    args = process.argv.slice(2),
    environment = process.env,
    run = spawnSync,
    ask = askSimulator,
    exists = existsSync,
    output = console.log,
    watchDirectory = resolve(scriptsDirectory, '../../watch-os'),
} = {}) {
    const options = parseArguments(args);
    if (options.help) {
        output(usage);
        return;
    }
    const execute = (command, commandArgs, action, inherit = false) => {
        const result = run(command, commandArgs, {
            env: environment,
            ...(inherit ? { stdio: 'inherit' } : { encoding: 'utf8' }),
        });
        if (result.error) throw new Error(`${action}: ${result.error.message}`);
        if (result.status !== 0)
            throw new Error(
                `${action} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}.`,
            );
        return result.stdout ?? '';
    };
    const simctl = (commandArgs, action) =>
        execute('xcrun', ['simctl', ...commandArgs], action);
    let selected;
    let phone;
    let viewerArguments;
    if (!options.buildOnly) {
        const inventory = JSON.parse(
            simctl(
                ['list', 'devices', 'available', '--json'],
                'Simulator discovery',
            ),
        );
        const watches = watchSimulators(inventory);
        if (!watches.length)
            throw new Error(
                'No available watchOS 10+ simulator. Install a watchOS runtime and create a Watch simulator in Xcode first.',
            );
        if (options.simulator)
            selected = watches.find(
                (watch) => watch.udid === options.simulator,
            );
        else if (watches.length === 1) selected = watches[0];
        else {
            watches.forEach((watch, index) =>
                output(
                    `${index + 1}. ${watch.name} (${watch.runtime}) — ${watch.udid}`,
                ),
            );
            const answer = String(await ask(watches.length)).trim();
            if (/^[1-9]\d*$/.test(answer))
                selected = watches[Number(answer) - 1];
        }
        if (!selected)
            throw new Error(
                'Select a listed Apple Watch simulator number or pass its UDID with --simulator.',
            );
        const { pairs = {} } = JSON.parse(
            simctl(['list', 'pairs', '--json'], 'Simulator pairing discovery'),
        );
        const pair = Object.values(pairs).find(
            (item) => item.watch?.udid === selected.udid,
        );
        phone = Object.values(inventory.devices ?? {})
            .flat()
            .find(
                (device) =>
                    device.isAvailable && device.udid === pair?.phone?.udid,
            );
        if (!phone)
            output(
                'No available paired iPhone simulator. The watch will wait for phone data; pair it in Xcode to test connectivity.',
            );
        const developerDirectory = execute(
            'xcode-select',
            ['-p'],
            'Active Xcode discovery',
        ).trim();
        const deviceHub = resolve(
            developerDirectory,
            '../Applications/DeviceHub.app',
        );
        const simulator = join(
            developerDirectory,
            'Applications/Simulator.app',
        );
        if (exists(deviceHub)) viewerArguments = ['-a', deviceHub];
        else if (exists(simulator))
            viewerArguments = [
                '-a',
                simulator,
                '--args',
                '-CurrentDeviceUDID',
                selected.udid,
            ];
        else
            throw new Error(
                `Cannot find Device Hub or Simulator in the active Xcode installation: ${developerDirectory}`,
            );
    }

    const configuration = options.profile === 'dev' ? 'Debug' : 'Release';
    const phoneBundle =
        options.profile === 'dev'
            ? 'com.anonymous.drivefree.dev'
            : 'com.anonymous.drivefree';
    const buildRoot =
        environment.DAF_EAS_LOCAL_BUILD_ROOT ||
        '/Volumes/PfeiferDev/DevCaches/chris/expo-builds';
    const products = join(buildRoot, 'watch-simulator', options.profile);
    const app = join(products, 'DAFWatch.app');
    output(`Building Apple Watch ${options.profile} (${configuration})...`);
    execute(
        'bash',
        [
            join(scriptsDirectory, 'xcodebuild-external.sh'),
            '-project',
            join(watchDirectory, 'DriversAgainstFlockWatch.xcodeproj'),
            '-scheme',
            'DAFWatch',
            '-configuration',
            configuration,
            '-sdk',
            'watchsimulator',
            '-destination',
            selected
                ? `platform=watchOS Simulator,id=${selected.udid}`
                : 'generic/platform=watchOS Simulator',
            `CONFIGURATION_BUILD_DIR=${products}`,
            `DAF_PHONE_BUNDLE_IDENTIFIER=${phoneBundle}`,
            `DAF_APP_GROUP=group.${phoneBundle}.watch`,
            'CODE_SIGNING_ALLOWED=NO',
            'build',
        ],
        'Apple Watch simulator build',
        true,
    );
    if (!exists(app)) throw new Error(`Watch build did not create ${app}`);
    output(`Watch simulator app: ${app}`);
    if (options.buildOnly) return;

    for (const device of [phone, selected].filter(Boolean)) {
        simctl(['bootstatus', device.udid, '-b'], `Boot ${device.name}`);
    }
    execute('open', viewerArguments, 'Open simulator viewer');
    simctl(['install', selected.udid, app], 'Watch app installation');
    simctl(
        [
            'launch',
            '--terminate-running-process',
            selected.udid,
            `${phoneBundle}.watchkitapp`,
        ],
        'Watch app launch',
    );
    output(
        `Installed and launched ${options.profile} on ${selected.name}. Open the matching DAF phone app for live data.`,
    );
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    buildWatch().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
