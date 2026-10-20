import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const expoRoot = new URL('../../', import.meta.url);
const readJson = (path) =>
    JSON.parse(readFileSync(new URL(path, expoRoot), 'utf8'));
const manifest = readJson('package.json');
const lock = readJson('package-lock.json');
const packages = [
    {
        name: '@react-native-firebase/app',
        version: '24.1.1',
        repository: 'react-native-firebase',
        files: [
            'dist/module/index.js',
            'app.plugin.js',
            'RNFBApp.podspec',
            'android/build.gradle',
        ],
    },
    {
        name: '@rnmapbox/maps',
        version: '10.3.5',
        repository: 'maps',
        files: [
            'lib/module/index.js',
            'src/index.ts',
            'app.plugin.js',
            'rnmapbox-maps.podspec',
            'android/build.gradle',
        ],
    },
    {
        name: 'expo-location',
        version: '57.0.20',
        repository: 'expo',
        files: [
            'build/index.js',
            'app.plugin.js',
            'expo-module.config.json',
            'ios/ExpoLocation.podspec',
            'android/build.gradle',
        ],
    },
    {
        name: 'expo-modules-jsi',
        version: '57.1.1',
        repository: 'expo',
        files: [
            'index.js',
            'expo-module.config.json',
            'apple/ExpoModulesJSI.podspec',
            'apple/scripts/build-xcframework.sh',
        ],
    },
    {
        name: 'query-string',
        version: '7.1.3',
        repository: 'query-string',
        files: ['index.js', 'index.d.ts'],
    },
];

for (const { name, version, repository, files } of packages) {
    test(`${name} uses a commit-pinned layered-tech fork with installable package contents`, () => {
        const dependency =
            manifest.dependencies[name] ?? manifest.overrides[name];
        const prefix = `git+https://github.com/layered-tech/${repository}.git#`;
        assert.ok(dependency.startsWith(prefix), dependency);
        const commit = dependency.slice(prefix.length);
        assert.match(commit, /^[a-f0-9]{40}$/);
        const locked = lock.packages[`node_modules/${name}`];
        assert.equal(locked.version, version);
        assert.equal(
            locked.resolved.replace(
                'git+ssh://git@github.com/',
                'git+https://github.com/',
            ),
            dependency,
        );
        if (manifest.dependencies[name]) {
            assert.equal(lock.packages[''].dependencies[name], dependency);
        }

        const installed = readJson(`node_modules/${name}/package.json`);
        assert.equal(installed.name, name);
        assert.equal(installed.version, version);
        assert.equal(installed.repository.url, prefix.slice(0, -1));
        assert.equal(installed.workspaces, undefined);
        for (const lifecycle of [
            'build',
            'prepare',
            'prepack',
            'preinstall',
            'install',
            'postinstall',
        ]) {
            assert.equal(installed.scripts?.[lifecycle], undefined, lifecycle);
        }
        for (const file of files) {
            assert.ok(
                existsSync(new URL(`node_modules/${name}/${file}`, expoRoot)),
                `${name}/${file}`,
            );
        }
    });
}

test('installation no longer depends on patch-package or local patch files', () => {
    assert.equal(manifest.scripts.postinstall, undefined);
    assert.equal(manifest.devDependencies['patch-package'], undefined);
    assert.equal(lock.packages['node_modules/patch-package'], undefined);
    const directory = new URL('patches/', expoRoot);
    const patches = existsSync(directory)
        ? readdirSync(directory).filter((name) => name.endsWith('.patch'))
        : [];
    assert.deepEqual(patches, []);
});

test('the Firebase fork removes the unused Photos framework access', () => {
    for (const extension of ['h', 'm']) {
        const source = readFileSync(
            new URL(
                `node_modules/@react-native-firebase/app/ios/RNFBApp/RNFBUtilsModule.${extension}`,
                expoRoot,
            ),
            'utf8',
        );
        assert.doesNotMatch(
            source,
            /Photos\/Photos\.h|PHAsset|fetchAssetForPath/,
        );
    }
});
