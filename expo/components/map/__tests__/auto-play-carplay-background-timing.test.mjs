import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );

test('AutoPlay installs native timers before every other app import', () => {
    const entry = readFileSync(
        new URL('../../../index.js', import.meta.url),
        'utf8',
    );
    assert.match(
        entry,
        /^import '@iternio\/react-native-auto-play\/installTimers';/,
    );
    assert.equal(
        existsSync(
            new URL(
                '../../../patches/react-native+0.86.2.patch',
                import.meta.url,
            ),
        ),
        false,
    );
    const timingSource = readFileSync(
        join(autoPlayPackageRoot, 'src/utils/AutoPlayTimers.ts'),
        'utf8',
    );
    for (const name of [
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
    ]) {
        assert.ok(timingSource.includes(`globalThis.${name} =`));
    }
});

test('the app exposes React Native source headers required by ExpoUI', () => {
    const require = createRequire(import.meta.url);
    const config = require('../../../app.config.js');
    const buildProperties = config.plugins.find(
        (plugin) =>
            Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    assert.equal(buildProperties[1].ios.buildReactNativeFromSource, true);
});
