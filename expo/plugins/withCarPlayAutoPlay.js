const { createRequire } = require("module");

function requireConfigPlugins() {
    try {
        return require("expo/config-plugins");
    } catch {
        return createRequire(`${process.cwd()}/package.json`)(
            "expo/config-plugins",
        );
    }
}

const {
    createRunOncePlugin,
    withAppDelegate,
    withEntitlementsPlist,
    withInfoPlist,
} = requireConfigPlugins();

const PLUGIN_NAME = "with-carplay-auto-play";
const PLUGIN_VERSION = "1.0.0";
const APP_DELEGATE_TAG = "react-native-auto-play-root-view";

// CarPlay scenes in @iternio/react-native-auto-play resolve React root views
// through this app-delegate hook by reflection (selector
// getRootViewForAutoplayWithModuleName:initialProperties:). The Expo factory
// path uses superView(...) so dev-client React delegate handlers (dev
// launcher) never intercept car screen root views.
const GET_ROOT_VIEW_FOR_AUTOPLAY = `
  @objc func getRootViewForAutoplay(
    moduleName: String,
    initialProperties: [String: Any]?
  ) -> UIView? {
    if let factory = reactNativeFactory?.rootViewFactory as? ExpoReactRootViewFactory {
      return factory.superView(
        withModuleName: moduleName,
        initialProperties: initialProperties,
        launchOptions: nil,
        devMenuConfiguration: nil
      )
    }

    return reactNativeFactory?.rootViewFactory.view(
      withModuleName: moduleName,
      initialProperties: initialProperties
    )
  }
`;

// Scene manifest from the react-native-auto-play iOS setup docs. The delegate
// class names are provided by the library; the window application scene keeps
// the phone app working once multiple scenes are enabled.
const SCENE_MANIFEST = {
    CPSupportsDashboardNavigationScene: true,
    CPSupportsInstrumentClusterNavigationScene: true,
    UIApplicationSupportsMultipleScenes: true,
    UISceneConfigurations: {
        CPTemplateApplicationDashboardSceneSessionRoleApplication: [
            {
                UISceneClassName: "CPTemplateApplicationDashboardScene",
                UISceneConfigurationName: "CarPlayDashboard",
                UISceneDelegateClassName: "DashboardSceneDelegate",
            },
        ],
        CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication: [
            {
                UISceneClassName: "CPTemplateApplicationInstrumentClusterScene",
                UISceneConfigurationName: "CarPlayCluster",
                UISceneDelegateClassName: "ClusterSceneDelegate",
            },
        ],
        CPTemplateApplicationSceneSessionRoleApplication: [
            {
                UISceneClassName: "CPTemplateApplicationScene",
                UISceneConfigurationName: "CarPlayHeadUnit",
                UISceneDelegateClassName: "HeadUnitSceneDelegate",
            },
        ],
        UIWindowSceneSessionRoleApplication: [
            {
                UISceneClassName: "UIWindowScene",
                UISceneConfigurationName: "WindowApplication",
                UISceneDelegateClassName: "WindowApplicationSceneDelegate",
            },
        ],
    },
};

function addGeneratedSwiftBlock(source, tag, block, anchor) {
    const header = `  // @generated begin ${tag}`;
    const footer = `  // @generated end ${tag}`;
    const pattern = new RegExp(
        `\\n?[^\\S\\n]*// @generated begin ${tag}[\\s\\S]*?// @generated end ${tag}\\n?`,
        "m",
    );
    const sanitizedSource = source.replace(pattern, "\n");
    const anchorIndex = sanitizedSource.indexOf(anchor);

    if (anchorIndex === -1) {
        throw new Error(
            `${PLUGIN_NAME}: could not find "${anchor}" in AppDelegate.swift to insert ${tag}`,
        );
    }

    const insertAt = anchorIndex + anchor.length;

    return `${sanitizedSource.slice(0, insertAt)}\n${header}\n${block.trimEnd()}\n${footer}\n${sanitizedSource.slice(insertAt)}`;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeSceneConfigurationEntries(existingEntries, requiredEntries) {
    const mergedEntries = Array.isArray(existingEntries)
        ? existingEntries.map((entry) =>
              isPlainObject(entry) ? { ...entry } : entry,
          )
        : [];

    requiredEntries.forEach((requiredEntry) => {
        const configurationName = requiredEntry.UISceneConfigurationName;
        const existingIndex = mergedEntries.findIndex(
            (entry) =>
                isPlainObject(entry) &&
                entry.UISceneConfigurationName === configurationName,
        );

        if (existingIndex === -1) {
            mergedEntries.push({ ...requiredEntry });
            return;
        }

        mergedEntries[existingIndex] = {
            ...mergedEntries[existingIndex],
            ...requiredEntry,
        };
    });

    return mergedEntries;
}

function mergeCarPlaySceneManifest(existingManifest) {
    const manifest = isPlainObject(existingManifest) ? existingManifest : {};
    const existingConfigurations = isPlainObject(manifest.UISceneConfigurations)
        ? manifest.UISceneConfigurations
        : {};
    const requiredConfigurations = SCENE_MANIFEST.UISceneConfigurations;
    const mergedConfigurations = { ...existingConfigurations };

    Object.entries(requiredConfigurations).forEach(([role, entries]) => {
        mergedConfigurations[role] = mergeSceneConfigurationEntries(
            existingConfigurations[role],
            entries,
        );
    });

    return {
        ...manifest,
        CPSupportsDashboardNavigationScene: true,
        CPSupportsInstrumentClusterNavigationScene: true,
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: mergedConfigurations,
    };
}

function ensureBundleIdentifierUrlScheme(infoPlist, bundleIdentifier) {
    if (!bundleIdentifier) {
        return infoPlist;
    }

    const urlTypes = Array.isArray(infoPlist.CFBundleURLTypes)
        ? infoPlist.CFBundleURLTypes
        : [];
    const schemeAlreadyRegistered = urlTypes.some((urlType) =>
        (urlType?.CFBundleURLSchemes ?? []).includes(bundleIdentifier),
    );

    if (schemeAlreadyRegistered) {
        return infoPlist;
    }

    // CarPlay dashboard buttons with launchHeadUnitScene open the head unit
    // app through a URL built from the bundle identifier.
    return {
        ...infoPlist,
        CFBundleURLTypes: [
            ...urlTypes,
            {
                CFBundleURLSchemes: [bundleIdentifier],
            },
        ],
    };
}

function applyCarPlayInfoPlist(infoPlist, bundleIdentifier) {
    return ensureBundleIdentifierUrlScheme(
        {
            ...infoPlist,
            UIApplicationSceneManifest: mergeCarPlaySceneManifest(
                infoPlist.UIApplicationSceneManifest,
            ),
        },
        bundleIdentifier,
    );
}

function addAutoPlayRootViewToAppDelegate(source) {
    return addGeneratedSwiftBlock(
        source,
        APP_DELEGATE_TAG,
        GET_ROOT_VIEW_FOR_AUTOPLAY,
        "class AppDelegate: ExpoAppDelegate {",
    );
}

function withCarPlayAutoPlay(config) {
    let nextConfig = withEntitlementsPlist(config, (entitlementsConfig) => {
        entitlementsConfig.modResults["com.apple.developer.carplay-maps"] =
            true;

        return entitlementsConfig;
    });

    nextConfig = withInfoPlist(nextConfig, (infoPlistConfig) => {
        infoPlistConfig.modResults = applyCarPlayInfoPlist(
            infoPlistConfig.modResults,
            infoPlistConfig.ios?.bundleIdentifier,
        );

        return infoPlistConfig;
    });

    return withAppDelegate(nextConfig, (appDelegateConfig) => {
        if (appDelegateConfig.modResults.language !== "swift") {
            throw new Error(
                `${PLUGIN_NAME}: only Swift AppDelegate templates are supported`,
            );
        }

        appDelegateConfig.modResults.contents = addAutoPlayRootViewToAppDelegate(
            appDelegateConfig.modResults.contents,
        );

        return appDelegateConfig;
    });
}

const plugin = createRunOncePlugin(
    withCarPlayAutoPlay,
    PLUGIN_NAME,
    PLUGIN_VERSION,
);

plugin.__testables = {
    addAutoPlayRootViewToAppDelegate,
    applyCarPlayInfoPlist,
    mergeCarPlaySceneManifest,
};

module.exports = plugin;
