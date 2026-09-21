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

test('iOS staging selects a profile with the staging runtime environment', () => {
    const command = rootPackage.scripts['build:ios:staging'];
    const profileName = command.match(/--profile\s+(\S+)/)?.[1];
    const selectedProfile = easConfig.build[profileName];

    assert.ok(
        selectedProfile,
        'the iOS staging command must select an existing profile',
    );
    const profile = {
        ...easConfig.build[selectedProfile.extends],
        ...selectedProfile,
    };
    assert.equal(profile.env.APP_ENV, 'staging');
    assert.equal(profile.environment, 'preview');
    assert.equal(profile.distribution, 'store');
});
