const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');
const { configureWatchProject, writeScheme, APP_TARGET, WIDGET_TARGET } = require('../../watch-os/project.cjs');

module.exports = function withAppleWatch(config) {
    const phoneBundle = config.ios.bundleIdentifier;
    const appGroup = `group.${phoneBundle}.watch`;
    const extensionTargets = [
        { targetName: APP_TARGET, bundleIdentifier: `${phoneBundle}.watchkitapp` },
        { targetName: WIDGET_TARGET, bundleIdentifier: `${phoneBundle}.watchkitapp.widgets` },
    ].map((target) => ({ ...target, entitlements: { 'com.apple.security.application-groups': [appGroup] } }));
    config.extra ??= {};
    config.extra.eas ??= {};
    config.extra.eas.build ??= {};
    config.extra.eas.build.experimental ??= {};
    config.extra.eas.build.experimental.ios ??= {};
    const ios = config.extra.eas.build.experimental.ios;
    ios.appExtensions = [
        ...(ios.appExtensions ?? []).filter((target) => ![APP_TARGET, WIDGET_TARGET].includes(target.targetName)),
        ...extensionTargets,
    ];

    return withXcodeProject(config, (mod) => {
        const project = mod.modResults;
        const entries = Object.entries(project.hash.project.objects.PBXNativeTarget);
        const phone = entries.find(([id, target]) => !id.endsWith('_comment')
            && String(target.productType).replaceAll('"', '') === 'com.apple.product-type.application'
            && ![APP_TARGET, WIDGET_TARGET].includes(String(target.name).replaceAll('"', '')));
        if (!phone) throw new Error('Apple Watch requires an iOS application target.');
        const platformRoot = mod.modRequest.platformProjectRoot;
        const sourceRoot = path.relative(platformRoot, path.resolve(mod.modRequest.projectRoot, '../watch-os')).split(path.sep).join('/');
        const objects = project.hash.project.objects;
        const configList = objects.XCConfigurationList[phone[1].buildConfigurationList];
        const firstConfig = configList.buildConfigurations[0];
        const phoneSettings = objects.XCBuildConfiguration[firstConfig.value ?? firstConfig].buildSettings;
        const clean = (value) => value == null ? undefined : String(value).replace(/^"|"$/g, '');
        const result = configureWatchProject(project, {
            phoneTargetId: phone[0], sourceRoot, phoneBundle,
            version: mod.version ?? clean(phoneSettings.MARKETING_VERSION),
            buildNumber: mod.ios?.buildNumber ?? clean(phoneSettings.CURRENT_PROJECT_VERSION) ?? '1',
            team: clean(phoneSettings.DEVELOPMENT_TEAM) ?? mod.ios?.appleTeamId,
        });
        const projectName = fs.readdirSync(platformRoot).find((name) => name.endsWith('.xcodeproj'));
        if (!projectName) throw new Error('Unable to locate generated iOS Xcode project.');
        writeScheme(path.join(platformRoot, projectName), result.appId);
        return mod;
    });
};
