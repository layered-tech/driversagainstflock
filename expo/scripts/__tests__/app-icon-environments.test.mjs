import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appConfigPath = require.resolve('../../app.config.js');
const expoDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadAppConfig(appEnvironment) {
    const originalAppEnvironment = process.env.APP_ENV;

    process.env.APP_ENV = appEnvironment;
    delete require.cache[appConfigPath];

    try {
        return require(appConfigPath);
    } finally {
        if (originalAppEnvironment === undefined) {
            delete process.env.APP_ENV;
        } else {
            process.env.APP_ENV = originalAppEnvironment;
        }

        delete require.cache[appConfigPath];
    }
}

function resolveAsset(assetPath) {
    return resolve(expoDirectory, assetPath.replace(/^\.\//, ''));
}

function pngDimensions(assetPath) {
    const contents = readFileSync(resolveAsset(assetPath));

    assert.equal(contents.subarray(1, 4).toString(), 'PNG');

    return {
        width: contents.readUInt32BE(16),
        height: contents.readUInt32BE(20),
    };
}

test('staging uses distinct icons on iOS and Android', () => {
    const stagingConfig = loadAppConfig('staging');
    const productionConfig = loadAppConfig('production');

    assert.notEqual(stagingConfig.icon, productionConfig.icon);
    assert.notDeepEqual(stagingConfig.ios.icon, productionConfig.ios.icon);
    assert.notEqual(
        stagingConfig.android.adaptiveIcon.foregroundImage,
        productionConfig.android.adaptiveIcon.foregroundImage,
    );
    assert.ok(
        !('monochromeImage' in stagingConfig.android.adaptiveIcon),
        'staging should keep its full-color icon when Android theming is enabled',
    );
    assert.equal(stagingConfig.android.icon, stagingConfig.icon);
});

test('staging icon assets exist at platform-appropriate sizes', () => {
    const stagingConfig = loadAppConfig('staging');
    const iosIconPaths = Object.values(stagingConfig.ios.icon);

    for (const assetPath of iosIconPaths) {
        assert.ok(existsSync(resolveAsset(assetPath)), assetPath);
    }

    for (const assetPath of iosIconPaths) {
        assert.deepEqual(pngDimensions(assetPath), {
            width: 1024,
            height: 1024,
        });
    }
});

test('production keeps its existing icon artwork', () => {
    const productionConfig = loadAppConfig('production');

    assert.equal(productionConfig.icon, './assets/images/app-logo.png');
    assert.deepEqual(productionConfig.ios.icon, {
        dark: './assets/images/logos/ios-icon-dark.png',
        light: './assets/images/logos/ios-icon-default.png',
        tinted: './assets/images/logos/ios-icon-monochrome.png',
    });
    assert.deepEqual(productionConfig.android.adaptiveIcon, {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/logos/android-icon-foreground.png',
        backgroundImage: './assets/images/logos/android-icon-background.png',
        monochromeImage: './assets/images/logos/android-icon-monochrome.png',
    });
});
