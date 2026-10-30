import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    getWearReleaseEnvironment,
    withWearVersion,
} from './build-wear-production.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 1 && args[0] === '--check-version'))
        throw new Error('Usage: build-wear-staging.mjs [--check-version]');
    const checkOnly = args[0] === '--check-version';
    const environment = checkOnly
        ? process.env
        : getWearReleaseEnvironment(resolve(scriptsDirectory, '..'));
    process.exitCode = await withWearVersion(
        resolve(scriptsDirectory, '../../wear-os'),
        environment,
        (buildEnvironment) => {
            const result = spawnSync(
                'bash',
                [resolve(scriptsDirectory, 'build-wear.sh'), 'staging'],
                { env: buildEnvironment, stdio: 'inherit' },
            );
            if (result.error) {
                throw new Error(
                    'Unable to start the Wear OS staging build script.',
                );
            }
            return result.status ?? 1;
        },
        { profile: 'staging', checkOnly },
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
