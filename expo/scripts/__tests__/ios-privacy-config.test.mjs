import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const appConfigPath = require.resolve('../../app.config.js');

for (const environment of ['development', 'e2e', 'staging', 'production']) {
    test(`${environment} includes the photo library purpose string required by bundled iOS APIs`, () => {
        const originalEnvironment = process.env.APP_ENV;
        process.env.APP_ENV = environment;
        delete require.cache[appConfigPath];

        try {
            const config = require(appConfigPath);

            assert.equal(
                config.ios.infoPlist.NSPhotoLibraryUsageDescription,
                'Drivers Against Flock uses file storage to download and cache road-corridor data for navigation. The file-storage library includes photo library support, but the app does not access or upload your photos.',
            );
        } finally {
            if (originalEnvironment === undefined) {
                delete process.env.APP_ENV;
            } else {
                process.env.APP_ENV = originalEnvironment;
            }

            delete require.cache[appConfigPath];
        }
    });
}
