import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const easConfig = JSON.parse(
    readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'),
);
const rootPackage = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
);

test('builds an installable staging APK without changing the staging AAB', () => {
    assert.equal(easConfig.build.staging.android.buildType, 'app-bundle');
    assert.deepEqual(easConfig.build['staging-apk'], {
        extends: 'staging',
        android: {
            buildType: 'apk',
        },
    });
});

test('exposes a root package shortcut for the staging APK profile', () => {
    assert.equal(
        rootPackage.scripts['build:android:staging-apk'],
        'cd expo && APP_ENV=staging EXPO_NO_DOTENV=1 npx dotenv -c staging -- ./scripts/eas-local-build.sh -p android --profile staging-apk --no-wait',
    );
});
