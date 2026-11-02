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

test('the Mapbox fork uses the default ProGuard configuration supported by AGP 9', () => {
    const source = readFileSync(
        new URL('node_modules/@rnmapbox/maps/android/build.gradle', expoRoot),
        'utf8',
    );
    assert.doesNotMatch(
        source,
        /getDefaultProguardFile\(['"]proguard-android\.txt['"]\)/,
    );
    assert.match(
        source,
        /getDefaultProguardFile\(['"]proguard-android-optimize\.txt['"]\)/,
    );
});

test('the Mapbox fork checks nullable bitmap copies before using them', () => {
    const source = readFileSync(
        new URL(
            'node_modules/@rnmapbox/maps/android/src/main/java/com/rnmapbox/rnmbx/utils/DownloadMapImageTask.kt',
            expoRoot,
        ),
        'utf8',
    );
    assert.ok(
        /val bitmap = requireNotNull\(image\.underlyingBitmap\?\.copy\(Bitmap\.Config\.ARGB_8888, true\)\)\s*\{/.test(
            source,
        ),
        'Guard both the nullable source bitmap and copy before setting density or adding the image.',
    );
    assert.ok(
        /catch \(e: Throwable\) \{[\s\S]*?Log\.e\(LOG_TAG, "Failed to load image: \$uri", e\)\s*null\s*\} finally \{\s*dataSource\.close\(\)\s*result\?\.let \{ CloseableReference\.closeSafely\(it\) \}/.test(
            source,
        ),
        'Failed bitmap copies must use the existing error handling and release image resources.',
    );
});

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

test('SDK 58 uses matching upstream Expo modules and no legacy query-string fork', () => {
    for (const name of [
        'expo',
        'expo-router',
        'expo-location',
        'expo-modules-jsi',
    ]) {
        assert.match(
            readJson(`node_modules/${name}/package.json`).version,
            /^58\./,
        );
    }
    assert.equal(manifest.overrides['expo-modules-jsi'], undefined);
    assert.equal(manifest.overrides['query-string'], undefined);
    assert.equal(lock.packages['node_modules/query-string'], undefined);
});
