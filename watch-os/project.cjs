const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_TARGET = 'DAFWatch';
const WIDGET_TARGET = 'DAFWatchWidgets';
const quote = (value) => JSON.stringify(String(value));
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '');
const reference = (value, comment) => ({ value, comment });
const identifier = (value) => (typeof value === 'object' ? value.value : value);

// Shared by the checked-in watch project and Expo's generated iPhone project.
// Synchronized folders keep Swift sources and resources owned by ./watch-os.
function configureWatchProject(project, options = {}) {
    const objects = project.hash.project.objects;
    const rootId = identifier(project.hash.project.rootObject);
    const root = objects.PBXProject[rootId];
    const sourceRoot = options.sourceRoot ?? '.';
    const phoneBundle = options.phoneBundle ?? 'com.anonymous.drivefree.dev';
    const group = `group.${phoneBundle}.watch`;
    const add = (isa, value, comment) => {
        const id = randomBytes(12).toString('hex').toUpperCase();
        objects[isa] ??= {};
        objects[isa][id] = { isa, ...value };
        objects[isa][`${id}_comment`] = comment;
        return id;
    };
    const existing = Object.entries(objects.PBXNativeTarget ?? {}).find(
        ([id, target]) => !id.endsWith('_comment') && unquote(target.name) === APP_TARGET,
    );
    if (existing) {
        // Prebuild can run without --clean; refresh environment, version and signing settings.
        for (const target of Object.values(objects.PBXNativeTarget)) {
            if (![APP_TARGET, WIDGET_TARGET].includes(unquote(target?.name))) continue;
            const list = objects.XCConfigurationList[identifier(target.buildConfigurationList)];
            for (const item of list.buildConfigurations) {
                const settings = objects.XCBuildConfiguration[identifier(item)].buildSettings;
                settings.DAF_PHONE_BUNDLE_IDENTIFIER = quote(phoneBundle);
                settings.DAF_APP_GROUP = quote(group);
                settings.MARKETING_VERSION = quote(options.version ?? '2.9.4');
                settings.CURRENT_PROJECT_VERSION = quote(options.buildNumber ?? '1');
                if (options.team) settings.DEVELOPMENT_TEAM = quote(options.team);
            }
        }
        return { appId: existing[0], appName: APP_TARGET };
    }
    const mainGroup = objects.PBXGroup[identifier(root.mainGroup)];
    let productsId = identifier(root.productRefGroup);
    if (!productsId) {
        productsId = add('PBXGroup', { children: [], name: 'Products', sourceTree: quote('<group>') }, 'Products');
        root.productRefGroup = productsId;
        mainGroup.children.push(reference(productsId, 'Products'));
    }
    const watchGroup = add('PBXGroup', { children: [], name: quote('Apple Watch'), sourceTree: quote('<group>') }, 'Apple Watch');
    mainGroup.children.push(reference(watchGroup, 'Apple Watch'));
    const children = objects.PBXGroup[watchGroup].children;
    const folders = {};
    for (const folder of ['WatchApp', 'Widgets', 'Shared']) {
        folders[folder] = add('PBXFileSystemSynchronizedRootGroup', {
            explicitFileTypes: {}, explicitFolders: [], path: quote(`${sourceRoot}/${folder}`), sourceTree: 'SOURCE_ROOT',
        }, folder);
        children.push(reference(folders[folder], folder));
    }
    const configRef = add('PBXFileReference', {
        lastKnownFileType: 'text.xcconfig', path: quote(`${sourceRoot}/Configuration/Companion.xcconfig`), sourceTree: 'SOURCE_ROOT',
    }, 'Companion.xcconfig');
    children.push(reference(configRef, 'Companion.xcconfig'));

    function target(name, isWidget) {
        const productName = `${name}.${isWidget ? 'appex' : 'app'}`;
        const productRef = add('PBXFileReference', {
            explicitFileType: isWidget ? quote('wrapper.app-extension') : 'wrapper.application',
            includeInIndex: 0, path: quote(productName), sourceTree: 'BUILT_PRODUCTS_DIR',
        }, productName);
        objects.PBXGroup[productsId].children.push(reference(productRef, productName));
        const configurations = ['Debug', 'Release'].map((configuration) => {
            const settings = {
                SDKROOT: 'watchos', SUPPORTED_PLATFORMS: quote('watchos watchsimulator'),
                WATCHOS_DEPLOYMENT_TARGET: '10.0', TARGETED_DEVICE_FAMILY: '4',
                SWIFT_VERSION: '5.0', SWIFT_STRICT_CONCURRENCY: 'minimal',
                SWIFT_OPTIMIZATION_LEVEL: quote(configuration === 'Debug' ? '-Onone' : '-O'),
                SWIFT_ACTIVE_COMPILATION_CONDITIONS: quote(configuration === 'Debug' ? 'DEBUG $(inherited)' : '$(inherited)'),
                DEBUG_INFORMATION_FORMAT: quote(configuration === 'Debug' ? 'dwarf' : 'dwarf-with-dsym'),
                CLANG_ENABLE_MODULES: 'YES', CODE_SIGN_STYLE: 'Automatic',
                GENERATE_INFOPLIST_FILE: 'NO', ENABLE_USER_SCRIPT_SANDBOXING: 'YES',
                INFOPLIST_FILE: quote(`${sourceRoot}/Configuration/${isWidget ? 'Widgets' : 'WatchApp'}-Info.plist`),
                CODE_SIGN_ENTITLEMENTS: quote(`${sourceRoot}/Configuration/Watch.entitlements`),
                PRODUCT_NAME: quote('$(TARGET_NAME)'),
                PRODUCT_BUNDLE_IDENTIFIER: quote(`$(DAF_PHONE_BUNDLE_IDENTIFIER).watchkitapp${isWidget ? '.widgets' : ''}`),
                LD_RUNPATH_SEARCH_PATHS: [quote('$(inherited)'), quote('@executable_path/Frameworks'), ...(isWidget ? [quote('@executable_path/../../Frameworks')] : [])],
                SKIP_INSTALL: isWidget || options.phoneTargetId ? 'YES' : 'NO',
                ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS: 'NO',
            };
            if (isWidget) settings.APPLICATION_EXTENSION_API_ONLY = 'YES';
            else settings.ASSETCATALOG_COMPILER_APPICON_NAME = 'AppIcon';
            if (options.phoneTargetId) {
                settings.DAF_PHONE_BUNDLE_IDENTIFIER = quote(phoneBundle);
                settings.DAF_APP_GROUP = quote(group);
                settings.MARKETING_VERSION = quote(options.version ?? '2.9.4');
                settings.CURRENT_PROJECT_VERSION = quote(options.buildNumber ?? '1');
            }
            if (options.team) settings.DEVELOPMENT_TEAM = quote(options.team);
            const id = add('XCBuildConfiguration', { baseConfigurationReference: configRef, buildSettings: settings, name: configuration }, configuration);
            return reference(id, configuration);
        });
        const configList = add('XCConfigurationList', {
            buildConfigurations: configurations, defaultConfigurationIsVisible: 0, defaultConfigurationName: 'Release',
        }, `${name} configuration list`);
        const phases = ['Sources', 'Frameworks', 'Resources'].map((phase) => {
            const id = add(`PBX${phase}BuildPhase`, { buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 }, phase);
            return reference(id, phase);
        });
        const id = add('PBXNativeTarget', {
            buildConfigurationList: configList, buildPhases: phases, buildRules: [], dependencies: [],
            fileSystemSynchronizedGroups: [reference(folders[isWidget ? 'Widgets' : 'WatchApp'], isWidget ? 'Widgets' : 'WatchApp'), reference(folders.Shared, 'Shared')],
            name: name, packageProductDependencies: [], productName: name, productReference: productRef,
            productType: quote(isWidget ? 'com.apple.product-type.app-extension' : 'com.apple.product-type.application'),
        }, name);
        root.targets.push(reference(id, name));
        root.attributes ??= {};
        root.attributes.TargetAttributes ??= {};
        root.attributes.TargetAttributes[id] = {
            CreatedOnToolsVersion: '16.0',
            SystemCapabilities: { 'com.apple.ApplicationGroups.iOS': { enabled: 1 } },
        };
        return { id, productRef, productName, name };
    }
    const app = target(APP_TARGET, false);
    const widgets = target(WIDGET_TARGET, true);

    function embed(parentId, child, watchContent) {
        const parent = objects.PBXNativeTarget[parentId];
        const proxy = add('PBXContainerItemProxy', {
            containerPortal: rootId, proxyType: 1, remoteGlobalIDString: child.id, remoteInfo: child.name,
        }, 'PBXContainerItemProxy');
        const dependency = add('PBXTargetDependency', { target: child.id, targetProxy: proxy }, 'PBXTargetDependency');
        parent.dependencies ??= [];
        parent.dependencies.push(reference(dependency, 'PBXTargetDependency'));
        const buildFile = add('PBXBuildFile', {
            fileRef: child.productRef, settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
        }, `${child.productName} in Embed ${watchContent ? 'Watch Content' : 'App Extensions'}`);
        const phaseName = watchContent ? 'Embed Watch Content' : 'Embed App Extensions';
        const phase = add('PBXCopyFilesBuildPhase', {
            buildActionMask: 2147483647,
            dstPath: quote(watchContent ? '$(CONTENTS_FOLDER_PATH)/Watch' : ''),
            dstSubfolderSpec: watchContent ? 16 : 13,
            files: [reference(buildFile, child.productName)], name: quote(phaseName), runOnlyForDeploymentPostprocessing: 0,
        }, phaseName);
        parent.buildPhases.push(reference(phase, phaseName));
    }
    embed(app.id, widgets, false);
    if (options.phoneTargetId) embed(options.phoneTargetId, app, true);
    project.hash.project.objectVersion = Math.max(Number(project.hash.project.objectVersion) || 0, 77);
    root.preferredProjectObjectVersion = 77;
    return { appId: app.id, appName: APP_TARGET };
}

function scheme(appId, container) {
    const buildable = `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${appId}" BuildableName="${APP_TARGET}.app" BlueprintName="${APP_TARGET}" ReferencedContainer="container:${container}"/>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="NO" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">${buildable}</BuildActionEntry></BuildActionEntries></BuildAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="NO"><BuildableProductRunnable runnableDebuggingMode="0">${buildable}</BuildableProductRunnable></LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">${buildable}</BuildableProductRunnable></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
`;
}

function writeScheme(directory, appId) {
    const output = path.join(directory, 'xcshareddata/xcschemes');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, `${APP_TARGET}.xcscheme`), scheme(appId, path.basename(directory)));
}

// Generation only: no package installation, compilation, simulator or test execution.
function createStandaloneProject() {
    const rootId = randomBytes(12).toString('hex').toUpperCase();
    const mainId = randomBytes(12).toString('hex').toUpperCase();
    const listId = randomBytes(12).toString('hex').toUpperCase();
    const objects = {
        PBXProject: { [rootId]: { isa: 'PBXProject', attributes: { LastUpgradeCheck: 1600 }, buildConfigurationList: listId,
            compatibilityVersion: quote('Xcode 16.0'), developmentRegion: 'en', hasScannedForEncodings: 0,
            knownRegions: ['en', 'Base'], mainGroup: mainId, projectDirPath: quote(''), projectRoot: quote(''), targets: [] } },
        PBXGroup: { [mainId]: { isa: 'PBXGroup', children: [], sourceTree: quote('<group>') } },
        XCBuildConfiguration: {},
        XCConfigurationList: { [listId]: { isa: 'XCConfigurationList', buildConfigurations: [], defaultConfigurationIsVisible: 0, defaultConfigurationName: 'Release' } },
    };
    for (const name of ['Debug', 'Release']) {
        const id = randomBytes(12).toString('hex').toUpperCase();
        objects.XCBuildConfiguration[id] = { isa: 'XCBuildConfiguration', buildSettings: {}, name };
        objects.XCConfigurationList[listId].buildConfigurations.push(reference(id, name));
    }
    const project = { hash: { project: { archiveVersion: 1, classes: {}, objectVersion: 77, objects, rootObject: rootId } } };
    const result = configureWatchProject(project);
    const flat = {};
    for (const section of Object.values(objects)) {
        for (const [id, value] of Object.entries(section)) { if (!id.endsWith('_comment')) flat[id] = value; }
    }
    function serialize(value, depth = 0) {
        const indent = '\t'.repeat(depth);
        if (Array.isArray(value)) return `(\n${value.map((item) => `${indent}\t${serialize(item, depth + 1)},`).join('\n')}\n${indent})`;
        if (value && typeof value === 'object' && 'value' in value) return value.value;
        if (value && typeof value === 'object') return `{\n${Object.entries(value).map(([key, item]) => `${indent}\t${/^[A-Za-z0-9_.]+$/.test(key) ? key : quote(key)} = ${serialize(item, depth + 1)};`).join('\n')}\n${indent}}`;
        return String(value);
    }
    const directory = path.join(__dirname, 'DriversAgainstFlockWatch.xcodeproj');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'project.pbxproj'), `// !$*UTF8*$!\n${serialize({ ...project.hash.project, objects: flat })}\n`);
    writeScheme(directory, result.appId);
}

module.exports = { configureWatchProject, writeScheme, APP_TARGET, WIDGET_TARGET };
if (require.main === module) createStandaloneProject();
