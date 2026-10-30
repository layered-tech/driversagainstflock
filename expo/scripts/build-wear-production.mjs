import {
    existsSync,
    readFileSync,
    realpathSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const signingFields = {
    WEAR_RELEASE_STORE_FILE: 'keystorePath',
    WEAR_RELEASE_STORE_PASSWORD: 'keystorePassword',
    WEAR_RELEASE_KEY_ALIAS: 'keyAlias',
    WEAR_RELEASE_KEY_PASSWORD: 'keyPassword',
};

export function withWearVersion(watchDirectory, environment, build) {
    const versionFile = resolve(watchDirectory, 'version-code.json');
    const lockFile = resolve(watchDirectory, '.version-code.lock');
    try {
        writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
    } catch {
        throw new Error(
            'Another Wear release build holds .version-code.lock. If it crashed, remove that lock after confirming no build is running.',
        );
    }
    try {
        const { lastVersionCode } = JSON.parse(
            readFileSync(versionFile, 'utf8'),
        );
        if (
            !Number.isInteger(lastVersionCode) ||
            lastVersionCode < 0 ||
            lastVersionCode > 2100000000
        ) {
            throw new Error(
                'Invalid lastVersionCode in wear-os/version-code.json.',
            );
        }
        const rawCode =
            environment.WEAR_VERSION_CODE ?? String(lastVersionCode + 1);
        const code = Number(rawCode);
        if (
            !/^[1-9][0-9]*$/.test(rawCode) ||
            !Number.isInteger(code) ||
            code <= lastVersionCode ||
            code > 2100000000
        ) {
            throw new Error(
                `WEAR_VERSION_CODE must be greater than ${lastVersionCode} and at most 2100000000.`,
            );
        }
        const status = build({
            ...environment,
            WEAR_VERSION_CODE: String(code),
        });
        if (status === 0) {
            writeFileSync(
                `${versionFile}.tmp`,
                JSON.stringify({ lastVersionCode: code }, null, 4) + '\n',
            );
            renameSync(`${versionFile}.tmp`, versionFile);
        }
        return status;
    } finally {
        unlinkSync(lockFile);
    }
}

export function getWearReleaseEnvironment(
    expoDirectory,
    environment = process.env,
) {
    const result = { ...environment };
    const configuredFields = Object.keys(signingFields).filter((key) =>
        Boolean(environment[key]),
    );
    if (configuredFields.length > 0) {
        for (const key of Object.keys(signingFields)) {
            if (!environment[key])
                throw new Error(
                    `Set ${key}; supply all four WEAR_RELEASE_* overrides together.`,
                );
        }
    } else {
        const credentialsPath = resolve(expoDirectory, 'credentials.json');
        if (!existsSync(credentialsPath)) {
            throw new Error(
                'Download the phone upload credentials first: eas credentials -p android > production > credentials.json > Download credentials from EAS.',
            );
        }
        let keystore;
        try {
            keystore = JSON.parse(readFileSync(credentialsPath, 'utf8'))
                ?.android?.keystore;
        } catch {
            // JSON parser errors may include portions of the credentials file.
            throw new Error(
                'Unable to read expo/credentials.json as JSON. Download the credentials again.',
            );
        }
        for (const [variable, field] of Object.entries(signingFields)) {
            if (typeof keystore?.[field] !== 'string' || !keystore[field]) {
                throw new Error(
                    `expo/credentials.json is missing android.keystore.${field}.`,
                );
            }
            result[variable] = keystore[field];
        }
        result.WEAR_RELEASE_STORE_FILE = resolve(
            expoDirectory,
            result.WEAR_RELEASE_STORE_FILE,
        );
    }
    if (
        !existsSync(result.WEAR_RELEASE_STORE_FILE) ||
        !statSync(result.WEAR_RELEASE_STORE_FILE).isFile()
    ) {
        throw new Error(
            'The configured Wear OS upload keystore file does not exist.',
        );
    }
    if (result.WEAR_RELEASE_KEY_ALIAS === 'androiddebugkey') {
        throw new Error(
            'Play bundles must use the phone upload key, not the Android debug key.',
        );
    }
    return result;
}

if (
    process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
    const args = process.argv.slice(2);
    try {
        const helpOnly =
            args.length === 1 && ['--help', '-h'].includes(args[0]);
        if (
            args.length &&
            !helpOnly &&
            !(args.length === 1 && args[0] === '--check-signing')
        ) {
            throw new Error(
                'Usage: build-wear-production.mjs [--help|--check-signing]',
            );
        }
        const environment = helpOnly
            ? process.env
            : getWearReleaseEnvironment(resolve(scriptsDirectory, '..'));
        if (args[0] === '--check-signing') {
            console.log(
                'Wear OS upload credentials are configured. No build was started.',
            );
        } else {
            const run = (buildEnvironment) => {
                const result = spawnSync(
                    'bash',
                    [
                        resolve(scriptsDirectory, 'build-wear.sh'),
                        helpOnly ? '--help' : 'production',
                    ],
                    {
                        env: buildEnvironment,
                        stdio: 'inherit',
                    },
                );
                if (result.error)
                    throw new Error(
                        'Unable to start the Wear OS build script.',
                    );
                return result.status ?? 1;
            };
            process.exitCode = helpOnly
                ? run(environment)
                : withWearVersion(
                      resolve(scriptsDirectory, '../../wear-os'),
                      environment,
                      run,
                  );
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
