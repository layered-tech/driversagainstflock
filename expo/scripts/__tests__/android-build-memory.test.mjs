import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const appConfig = require('../../app.config.js');
const withGradleJvmMemory = require('../../plugins/withGradleJvmMemory');

test('registers the Gradle JVM memory config plugin', () => {
    assert.ok(appConfig.plugins.includes('./plugins/withGradleJvmMemory'));
});

test('reserves enough Gradle metaspace for release lint', () => {
    const gradleProperties = withGradleJvmMemory.updateGradleJvmArgs([
        {
            type: 'property',
            key: 'org.gradle.jvmargs',
            value: '-Xmx2048m -XX:MaxMetaspaceSize=512m',
        },
    ]);

    assert.equal(
        gradleProperties[0].value,
        '-Xmx2048m -XX:MaxMetaspaceSize=1g',
    );
});
