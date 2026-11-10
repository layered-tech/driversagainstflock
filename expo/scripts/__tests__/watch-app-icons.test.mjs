import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const { configureWatchProject } = createRequire(import.meta.url)(
    '../../../watch-os/project.cjs',
);

test('watch project generation preserves standalone icons on repeated prebuilds', () => {
    const objects = {
        PBXProject: { root: { mainGroup: 'main', targets: [] } },
        PBXGroup: { main: { children: [] } },
    };
    const project = { hash: { project: { rootObject: 'root', objects } } };
    const { appId } = configureWatchProject(project);
    const configurations =
        objects.XCConfigurationList[
            objects.PBXNativeTarget[appId].buildConfigurationList
        ].buildConfigurations;

    for (const { value } of configurations) {
        assert.equal(
            objects.XCBuildConfiguration[value].buildSettings
                .ASSETCATALOG_COMPILER_STANDALONE_ICON_BEHAVIOR,
            'all',
        );
        delete objects.XCBuildConfiguration[value].buildSettings
            .ASSETCATALOG_COMPILER_STANDALONE_ICON_BEHAVIOR;
    }
    configureWatchProject(project);

    for (const { value } of configurations) {
        assert.equal(
            objects.XCBuildConfiguration[value].buildSettings
                .ASSETCATALOG_COMPILER_STANDALONE_ICON_BEHAVIOR,
            'all',
        );
    }
});

function readPlist(path) {
    const result = spawnSync('plutil', ['-convert', 'json', '-o', '-', path], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test(
    'watch app catalog compiles icon files and App Store icon metadata',
    {
        skip:
            process.platform !== 'darwin' &&
            'Requires Xcode with the watchOS SDK',
    },
    (t) => {
        const sdk = spawnSync(
            'xcrun',
            ['--sdk', 'watchos', '--show-sdk-path'],
            { encoding: 'utf8' },
        );
        if (sdk.status !== 0) {
            t.skip('Requires Xcode with the watchOS SDK');
            return;
        }
        const directory = mkdtempSync(join(tmpdir(), 'watch-app-icons-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const plistPath = join(directory, 'icons.plist');
        const watchRoot = fileURLToPath(
            new URL('../../../watch-os/', import.meta.url),
        );
        const project = readPlist(
            join(
                watchRoot,
                'DriversAgainstFlockWatch.xcodeproj/project.pbxproj',
            ),
        );
        const target = Object.values(project.objects).find(
            (object) =>
                object.isa === 'PBXNativeTarget' && object.name === 'DAFWatch',
        );
        const configurations =
            project.objects[target.buildConfigurationList].buildConfigurations;
        const settings =
            project.objects[
                configurations.find(
                    (id) => project.objects[id].name === 'Release',
                )
            ].buildSettings;
        const result = spawnSync(
            'xcrun',
            [
                'actool',
                fileURLToPath(
                    new URL(
                        '../../../watch-os/WatchApp/Resources/Assets.xcassets',
                        import.meta.url,
                    ),
                ),
                '--compile',
                directory,
                '--platform',
                'watchos',
                '--target-device',
                'watch',
                '--minimum-deployment-target',
                '10.0',
                '--app-icon',
                settings.ASSETCATALOG_COMPILER_APPICON_NAME,
                '--standalone-icon-behavior',
                settings.ASSETCATALOG_COMPILER_STANDALONE_ICON_BEHAVIOR ??
                    'default',
                '--output-partial-info-plist',
                plistPath,
            ],
            { encoding: 'utf8', timeout: 120_000 },
        );

        assert.equal(
            result.status,
            0,
            result.error?.message ?? `${result.stdout}\n${result.stderr}`,
        );
        const compiled = readPlist(plistPath).CFBundleIcons.CFBundlePrimaryIcon;
        const source = readPlist(
            join(watchRoot, 'Configuration/WatchApp-Info.plist'),
        );
        assert.equal(compiled.CFBundleIconName, 'AppIcon');
        assert.equal(
            source.CFBundleIconName.replace(
                '$(ASSETCATALOG_COMPILER_APPICON_NAME)',
                settings.ASSETCATALOG_COMPILER_APPICON_NAME,
            ),
            'AppIcon',
        );
        assert.ok(
            source.CFBundleIconFiles?.length > 0,
            'watch bundle must declare icon files',
        );
        assert.ok(
            compiled.CFBundleIconFiles?.length > 0,
            'asset compiler must emit icon files',
        );
        for (const filename of source.CFBundleIconFiles) {
            assert.ok(compiled.CFBundleIconFiles.includes(filename), filename);
            assert.ok(
                existsSync(join(directory, `${filename}@2x.png`)),
                filename,
            );
        }
    },
);
