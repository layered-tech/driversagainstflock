import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const appConfig = require('../../app.config.js');
const {
    updateAppBuildGradle,
} = require('../../plugins/withCanonicalReactNativeWorkletsPath');

const source = `apply plugin: "com.android.application"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

android {
}
`;

test('registers the canonical Worklets path config plugin', () => {
    assert.ok(
        appConfig.plugins.includes(
            './plugins/withCanonicalReactNativeWorkletsPath',
        ),
    );
});

test('derives the Worklets path from the autolinked Gradle project', () => {
    const result = updateAppBuildGradle(source);

    assert.match(
        result,
        /rootProject\.findProject\(":react-native-worklets"\)/,
    );
    assert.match(
        result,
        /reactNativeWorkletsProject\.projectDir\.parentFile\.canonicalPath/,
    );
});

test('updates the Worklets path block idempotently', () => {
    const firstResult = updateAppBuildGradle(source);
    const secondResult = updateAppBuildGradle(firstResult);

    assert.equal(secondResult, firstResult);
    assert.equal(
        secondResult.match(
            /@generated begin canonical-react-native-worklets-path/g,
        )?.length,
        1,
    );
});
