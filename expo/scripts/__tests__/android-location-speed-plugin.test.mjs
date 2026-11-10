import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
    preserveUnavailableSpeed,
    patchAndroidLocationSpeed,
} = require('../../plugins/withAndroidLocationSpeed');
const source = readFileSync(
    new URL(
        '../../node_modules/expo-location/android/src/main/java/expo/modules/location/records/LocationResults.kt',
        import.meta.url,
    ),
    'utf8',
);
const originalConversion = 'speed = location.speed.toDouble()';
const guardedConversion =
    'speed = if (location.hasSpeed()) location.speed.toDouble() else null';

test('Android location conversion preserves missing speed and genuine zero', () => {
    const original = source.replace(guardedConversion, originalConversion);
    const patched = preserveUnavailableSpeed(original);

    assert.equal(
        patched,
        original.replace(originalConversion, guardedConversion),
    );
    assert.match(patched, /speed\?\.let \{ putDouble\("speed", it\) \}/);
    assert.equal(preserveUnavailableSpeed(patched), patched);
});

test('the guard fails clearly on an unknown or ambiguous native conversion', () => {
    for (const changed of [
        'class ChangedLocationResults {}',
        'speed = getSpeed(location)',
        `${originalConversion}\n${originalConversion}`,
        `${guardedConversion}\n${originalConversion}`,
    ]) {
        assert.throws(
            () => preserveUnavailableSpeed(changed),
            /Location speed conversion changed/,
        );
    }
});

test('the guarded converter serves foreground and background delivery', () => {
    const readNative = (file) =>
        readFileSync(
            new URL(
                `../../node_modules/expo-location/android/src/main/java/expo/modules/location/${file}`,
                import.meta.url,
            ),
            'utf8',
        );

    assert.match(source, /coords = LocationObjectCoords\(location\)/);
    assert.match(
        readNative('LocationHelpers.kt'),
        /sendLocationResponse\(watchId, LocationResponse\(location\)\)/,
    );
    assert.match(
        readNative('taskConsumers/LocationTaskConsumer.kt'),
        /LocationResponse\(location\)\.toPersistableBundle\(\)/,
    );
});

test('regeneration installs the guard and compiles Expo Location from source', () => {
    const config = require('../../app.config');
    const manifest = require('../../package.json');

    assert.ok(config.plugins.includes('./plugins/withAndroidLocationSpeed'));
    assert.ok(
        manifest.expo.autolinking.android.buildFromSource.includes(
            'expo-location',
        ),
    );
});

test('the plugin patches the app-resolved dependency and refuses to overwrite unknown source', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'daf-location-speed-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const moduleRoot = path.join(root, 'node_modules/expo-location');
    const target = path.join(
        moduleRoot,
        'android/src/main/java/expo/modules/location/records/LocationResults.kt',
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(
        path.join(moduleRoot, 'package.json'),
        '{"name":"expo-location"}',
    );
    const original = source.replace(guardedConversion, originalConversion);
    await writeFile(target, original);

    await patchAndroidLocationSpeed(root);
    assert.equal(
        await readFile(target, 'utf8'),
        preserveUnavailableSpeed(original),
    );
    await patchAndroidLocationSpeed(root);
    assert.equal(
        await readFile(target, 'utf8'),
        preserveUnavailableSpeed(original),
    );

    await writeFile(target, 'class ChangedLocationResults {}');
    await assert.rejects(
        patchAndroidLocationSpeed(root),
        /Location speed conversion changed/,
    );
    assert.equal(
        await readFile(target, 'utf8'),
        'class ChangedLocationResults {}',
    );
});
