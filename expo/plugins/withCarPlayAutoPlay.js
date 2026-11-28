const { createRequire } = require('module');
const {
    carPlayInstrumentClusterEnabled: instrumentClusterEnabled,
} = require('../car-display-config');

function requireConfigPlugins() {
    try {
        return require('expo/config-plugins');
    } catch {
        return createRequire(`${process.cwd()}/package.json`)(
            'expo/config-plugins',
        );
    }
}

const {
    createRunOncePlugin,
    withAppDelegate,
    withEntitlementsPlist,
    withInfoPlist,
} = requireConfigPlugins();

const PLUGIN_NAME = 'with-carplay-auto-play';
const PLUGIN_VERSION = '1.0.0';
const APP_DELEGATE_TAG = 'react-native-auto-play-root-view';
const WINDOW_SCENE_TAG = 'daf-expo-window-scene';

// CarPlay scenes in @iternio/react-native-auto-play resolve React root views
// through this app-delegate hook by reflection (selector
// getRootViewForAutoplayWithModuleName:initialProperties:). The Expo factory
// path uses superView(...) so dev-client React delegate handlers (dev
// launcher) never intercept car screen root views.
const GET_ROOT_VIEW_FOR_AUTOPLAY = `
  override init() {
    super.init()
    NotificationCenter.default.addObserver(self, selector: #selector(carSceneWillConnect(_:)),
      name: UIScene.willConnectNotification, object: nil)
  }

  @objc private func carSceneWillConnect(_ notification: Notification) {
    guard let scene = notification.object as? UIScene,
      scene is CPTemplateApplicationScene || scene is CPTemplateApplicationDashboardScene ||
        scene is CPTemplateApplicationInstrumentClusterScene,
      let factory = reactNativeFactory else { return }

#if DEBUG
    // A development client may still be waiting for the phone to select a bundle.
    guard reactNativeDelegate?.bundleURL() != nil else { return }
#endif

    // On a car-only launch there is no phone window to load the JS entry point.
    // The scene delegates request their own surfaces once JS registers them.
    factory.rootViewFactory.initializeReactHost(launchOptions: nil,
      bundleConfiguration: factory.bundleConfiguration,
      devMenuConfiguration: factory.devMenuConfiguration ?? RCTDevMenuConfiguration.default())
  }

  @objc func getRootViewForAutoplay(
    moduleName: String,
    initialProperties: [String: Any]?
  ) -> UIView? {
    if let factory = reactNativeFactory?.rootViewFactory as? ExpoReactRootViewFactory {
      return factory.superView(
        withModuleName: moduleName,
        initialProperties: initialProperties,
        launchOptions: nil,
        bundleConfiguration: RCTBundleConfiguration.default(),
        devMenuConfiguration: nil
      )
    }

    return reactNativeFactory?.rootViewFactory.view(
      withModuleName: moduleName,
      initialProperties: initialProperties
    )
  }
`;

// Expo owns the phone window, RN startup and links. Auto Play also consumes
// the phone's visibility callbacks while car scenes are connected.
const EXPO_WINDOW_SCENE_DELEGATE = `
@objc(DAFWindowApplicationSceneDelegate)
class DAFWindowApplicationSceneDelegate: SceneDelegate {
  private let autoPlayDelegate: UIWindowSceneDelegate = {
    guard let delegateClass = NSClassFromString("WindowApplicationSceneDelegate") as? NSObject.Type,
      let delegate = delegateClass.init() as? UIWindowSceneDelegate else {
      fatalError("AutoPlay phone window scene delegate is unavailable")
    }
    return delegate
  }()

  override func sceneDidBecomeActive(_ scene: UIScene) {
    super.sceneDidBecomeActive(scene)
    autoPlayDelegate.sceneDidBecomeActive?(scene)
  }

  override func sceneWillResignActive(_ scene: UIScene) {
    super.sceneWillResignActive(scene)
    autoPlayDelegate.sceneWillResignActive?(scene)
  }

  override func sceneWillEnterForeground(_ scene: UIScene) {
    super.sceneWillEnterForeground(scene)
    autoPlayDelegate.sceneWillEnterForeground?(scene)
  }

  override func sceneDidEnterBackground(_ scene: UIScene) {
    super.sceneDidEnterBackground(scene)
    autoPlayDelegate.sceneDidEnterBackground?(scene)
  }
}
`;

const SCENE_MANIFEST = {
    CPSupportsDashboardNavigationScene: true,
    CPSupportsInstrumentClusterNavigationScene: instrumentClusterEnabled,
    UIApplicationSupportsMultipleScenes: true,
    UISceneConfigurations: {
        CPTemplateApplicationDashboardSceneSessionRoleApplication: [
            {
                UISceneClassName: 'CPTemplateApplicationDashboardScene',
                UISceneConfigurationName: 'CarPlayDashboard',
                UISceneDelegateClassName: 'DashboardSceneDelegate',
            },
        ],
        CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication: [
            {
                UISceneClassName: 'CPTemplateApplicationInstrumentClusterScene',
                UISceneConfigurationName: 'CarPlayCluster',
                UISceneDelegateClassName: 'ClusterSceneDelegate',
            },
        ],
        CPTemplateApplicationSceneSessionRoleApplication: [
            {
                UISceneClassName: 'CPTemplateApplicationScene',
                UISceneConfigurationName: 'CarPlayHeadUnit',
                UISceneDelegateClassName: 'HeadUnitSceneDelegate',
            },
        ],
        UIWindowSceneSessionRoleApplication: [
            {
                UISceneClassName: 'UIWindowScene',
                UISceneConfigurationName: 'WindowApplication',
                UISceneDelegateClassName: 'DAFWindowApplicationSceneDelegate',
            },
        ],
    },
};

function addGeneratedSwiftBlock(source, tag, block, anchor) {
    const header = `  // @generated begin ${tag}`;
    const footer = `  // @generated end ${tag}`;
    const pattern = new RegExp(
        `\\n?[^\\S\\n]*// @generated begin ${tag}[\\s\\S]*?// @generated end ${tag}\\n?`,
        'm',
    );
    const sanitizedSource = source.replace(pattern, '');
    const anchorIndex = sanitizedSource.indexOf(anchor);

    const anchorLineStart = sanitizedSource.lastIndexOf('\n', anchorIndex) + 1;
    const anchorPrefix = sanitizedSource.slice(anchorLineStart, anchorIndex);

    if (anchorIndex === -1 || !/^\s*(?:public\s+)?$/.test(anchorPrefix)) {
        throw new Error(
            `${PLUGIN_NAME}: could not find "${anchor}" in AppDelegate.swift to insert ${tag}`,
        );
    }

    const insertAt = anchorIndex + anchor.length;

    return `${sanitizedSource.slice(0, insertAt)}\n${header}\n${block.trimEnd()}\n${footer}\n${sanitizedSource.slice(insertAt)}`;
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function mergePhoneSceneConfiguration(existingEntries, phone) {
    const entries = Array.isArray(existingEntries) ? existingEntries : [];
    const expoDelegateNames = [
        '$(PRODUCT_MODULE_NAME).SceneDelegate',
        'SceneDelegate',
        phone.UISceneDelegateClassName,
    ];
    const expoDefault = entries.find(
        (entry) =>
            entry?.UISceneConfigurationName === 'Default Configuration' &&
            expoDelegateNames.includes(entry.UISceneDelegateClassName),
    );
    if (!expoDefault) {
        return mergeSceneConfigurationEntries(entries, [phone]);
    }

    // Earlier prebuilds appended WindowApplication beside Expo's phone scene.
    const withoutLegacyPhone = entries.filter(
        (entry) =>
            entry?.UISceneConfigurationName !==
                phone.UISceneConfigurationName ||
            entry.UISceneDelegateClassName !== phone.UISceneDelegateClassName,
    );
    return mergeSceneConfigurationEntries(withoutLegacyPhone, [
        {
            ...phone,
            UISceneConfigurationName: expoDefault.UISceneConfigurationName,
        },
    ]);
}

function mergeCarPlaySceneManifest(existingManifest) {
    const manifest = isPlainObject(existingManifest) ? existingManifest : {};
    const existingConfigurations = isPlainObject(manifest.UISceneConfigurations)
        ? manifest.UISceneConfigurations
        : {};
    const requiredConfigurations = SCENE_MANIFEST.UISceneConfigurations;
    const mergedConfigurations = { ...existingConfigurations };

    Object.entries(requiredConfigurations).forEach(([role, entries]) => {
        mergedConfigurations[role] =
            role === 'UIWindowSceneSessionRoleApplication'
                ? mergePhoneSceneConfiguration(
                      existingConfigurations[role],
                      entries[0],
                  )
                : mergeSceneConfigurationEntries(
                      existingConfigurations[role],
                      entries,
                  );
    });

    if (!instrumentClusterEnabled) {
        delete mergedConfigurations.CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication;
    }

    return {
        ...manifest,
        CPSupportsDashboardNavigationScene: true,
        CPSupportsInstrumentClusterNavigationScene: instrumentClusterEnabled,
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
    const declaration = source.match(
        /class AppDelegate\s*:\s*ExpoAppDelegate\b(?:\s*,\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)*\s*\{/,
    )?.[0];

    return addGeneratedSwiftBlock(
        /^(?:internal )?import CarPlay$/m.test(source)
            ? source
            : `import CarPlay\n${source}`,
        APP_DELEGATE_TAG,
        GET_ROOT_VIEW_FOR_AUTOPLAY,
        declaration ?? 'class AppDelegate: ExpoAppDelegate {',
    );
}

function addExpoWindowSceneDelegateToAppDelegate(source) {
    const header = `// @generated begin ${WINDOW_SCENE_TAG}`;
    const footer = `// @generated end ${WINDOW_SCENE_TAG}`;
    const pattern = new RegExp(
        `\\n?// @generated begin ${WINDOW_SCENE_TAG}[\\s\\S]*?// @generated end ${WINDOW_SCENE_TAG}\\n?`,
        'm',
    );
    const sanitizedSource = source.replace(pattern, '').trimEnd();
    return `${sanitizedSource}\n\n${header}\n${EXPO_WINDOW_SCENE_DELEGATE.trim()}\n${footer}\n`;
}

function withCarPlayAutoPlay(config) {
    let nextConfig = withEntitlementsPlist(config, (entitlementsConfig) => {
        entitlementsConfig.modResults['com.apple.developer.carplay-maps'] =
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
        if (appDelegateConfig.modResults.language !== 'swift') {
            throw new Error(
                `${PLUGIN_NAME}: only Swift AppDelegate templates are supported`,
            );
        }

        appDelegateConfig.modResults.contents =
            addExpoWindowSceneDelegateToAppDelegate(
                addAutoPlayRootViewToAppDelegate(
                    appDelegateConfig.modResults.contents,
                ),
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
    addExpoWindowSceneDelegateToAppDelegate,
    applyCarPlayInfoPlist,
    mergeCarPlaySceneManifest,
};

module.exports = plugin;
