import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const appConfig = require('../../app.config.js');
const {
    addUniqueCocoaPodsUuids,
} = require('../../plugins/withUniqueCocoaPodsUuids');

test('registers the unique CocoaPods UUID config plugin', () => {
    assert.ok(appConfig.plugins.includes('./plugins/withUniqueCocoaPodsUuids'));
});

test('adds collision-safe CocoaPods UUID generation idempotently', () => {
    const podfile = "platform :ios, '15.1'\n";
    const transformedPodfile = addUniqueCocoaPodsUuids(
        addUniqueCocoaPodsUuids(podfile),
    );

    assert.equal(transformedPodfile.match(/class ::Pod::Project/g)?.length, 1);
    assert.match(
        transformedPodfile,
        /existing_uuids = @generated_uuids \+ uuids/,
    );
});
