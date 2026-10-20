import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const expoRoot = new URL('../../', import.meta.url);
const packageName = '@iternio/react-native-auto-play';
const dependency =
    'github:layered-tech/react-native-auto-play#navigation-controls';
const readJson = (path) =>
    JSON.parse(readFileSync(new URL(path, expoRoot), 'utf8'));

test('Auto Play comes from the layered-tech package branch with a locked commit', () => {
    const manifest = readJson('package.json');
    const lock = readJson('package-lock.json');
    assert.equal(manifest.dependencies[packageName], dependency);
    assert.equal(lock.packages[''].dependencies[packageName], dependency);
    assert.match(
        lock.packages[`node_modules/${packageName}`].resolved,
        /^git\+(?:https:\/\/|ssh:\/\/git@)github\.com\/layered-tech\/react-native-auto-play\.git#[a-f0-9]{40}$/,
    );
});

test('the generated Auto Play package exposes runtime and native entrypoints', () => {
    const installed = readJson(`node_modules/${packageName}/package.json`);
    assert.equal(installed.name, packageName);
    assert.match(installed.gitHead, /^[a-f0-9]{40}$/);
    assert.equal(
        installed.repository.url,
        'git+https://github.com/layered-tech/react-native-auto-play.git',
    );
    assert.equal(installed.scripts?.prepare, undefined);
    for (const path of [
        `${installed.main}.js`,
        `${installed['react-native']}.ts`,
        installed.types,
        'ReactNativeAutoPlay.podspec',
        'react-native.config.js',
        'android/build.gradle',
        'nitrogen/generated/android/ReactNativeAutoPlayOnLoad.cpp',
        'nitrogen/generated/ios/ReactNativeAutoPlay+autolinking.rb',
    ]) {
        assert.ok(
            existsSync(
                new URL(`node_modules/${packageName}/${path}`, expoRoot),
            ),
            path,
        );
    }
});

test('Auto Play is installed without local patches', () => {
    const directory = new URL('patches/', expoRoot);
    const patches = (
        existsSync(directory) ? readdirSync(directory) : []
    ).filter((name) => name.startsWith('@iternio+react-native-auto-play+'));
    assert.deepEqual(patches, []);
});
