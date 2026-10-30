import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    getWearReleaseEnvironment,
    withWearVersion,
} from './build-wear-production.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

try {
    const environment = getWearReleaseEnvironment(
        resolve(scriptsDirectory, '..'),
    );
    process.exitCode = withWearVersion(
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
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
