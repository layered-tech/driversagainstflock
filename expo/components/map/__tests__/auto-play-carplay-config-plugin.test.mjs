import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const carPlayAutoPlayPlugin = require('../../../plugins/withCarPlayAutoPlay.js');
const {
    addAutoPlayRootViewToAppDelegate,
    addExpoWindowSceneDelegateToAppDelegate,
    applyCarPlayInfoPlist,
    mergeCarPlaySceneManifest,
} = carPlayAutoPlayPlugin.__testables;

const currentExpoAppDelegateFixture = `import Expo
import React

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('CarPlay Auto Play config plugin', () => {
    test('injects the Expo factory-provider AppDelegate idempotently', () => {
        const declaration =
            'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
        const fixture = currentExpoAppDelegateFixture.replace(
            'public class AppDelegate: ExpoAppDelegate {',
            declaration,
        );
        const firstResult = addAutoPlayRootViewToAppDelegate(fixture);

        assert.equal(
            addAutoPlayRootViewToAppDelegate(firstResult),
            firstResult,
        );
        assert.ok(firstResult.includes(declaration));
        assert.ok(
            firstResult.indexOf('getRootViewForAutoplay') >
                firstResult.indexOf(declaration),
        );
        assert.ok(
            firstResult.indexOf('getRootViewForAutoplay') <
                firstResult.indexOf('public override func application'),
        );
        assert.equal(
            firstResult.match(
                /@generated begin react-native-auto-play-root-view/g,
            ).length,
            1,
        );
    });

    test('merges CarPlay scenes without replacing unrelated manifest entries', () => {
        const existingManifest = {
            CustomManifestValue: 'preserved',
            UIApplicationSupportsMultipleScenes: false,
            UISceneConfigurations: {
                CustomSceneSessionRole: [
                    {
                        UISceneConfigurationName: 'CustomScene',
                        UISceneDelegateClassName: 'CustomSceneDelegate',
                    },
                ],
                UIWindowSceneSessionRoleApplication: [
                    {
                        CustomWindowValue: 'preserved',
                        UISceneConfigurationName: 'WindowApplication',
                        UISceneDelegateClassName: 'PreviousWindowDelegate',
                    },
                    {
                        UISceneConfigurationName: 'SecondaryWindow',
                        UISceneDelegateClassName: 'SecondaryWindowDelegate',
                    },
                ],
            },
        };

        const mergedManifest = mergeCarPlaySceneManifest(existingManifest);
        const windowScenes =
            mergedManifest.UISceneConfigurations
                .UIWindowSceneSessionRoleApplication;

        assert.equal(mergedManifest.CustomManifestValue, 'preserved');
        assert.equal(mergedManifest.UIApplicationSupportsMultipleScenes, true);
        assert.equal(mergedManifest.CPSupportsDashboardNavigationScene, true);
        assert.equal(
            mergedManifest.CPSupportsInstrumentClusterNavigationScene,
            true,
        );
        assert.deepEqual(
            mergedManifest.UISceneConfigurations.CustomSceneSessionRole,
            existingManifest.UISceneConfigurations.CustomSceneSessionRole,
        );
        assert.deepEqual(windowScenes, [
            {
                CustomWindowValue: 'preserved',
                UISceneClassName: 'UIWindowScene',
                UISceneConfigurationName: 'WindowApplication',
                UISceneDelegateClassName: 'DAFWindowApplicationSceneDelegate',
            },
            {
                UISceneConfigurationName: 'SecondaryWindow',
                UISceneDelegateClassName: 'SecondaryWindowDelegate',
            },
        ]);
        assert.equal(
            mergedManifest.UISceneConfigurations
                .CPTemplateApplicationSceneSessionRoleApplication[0]
                .UISceneDelegateClassName,
            'HeadUnitSceneDelegate',
        );
    });

    test('registers the cluster scene alongside Dashboard and head-unit scenes', () => {
        const manifest = mergeCarPlaySceneManifest({
            CPSupportsInstrumentClusterNavigationScene: true,
            UISceneConfigurations: {
                CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication:
                    [{ UISceneDelegateClassName: 'ClusterSceneDelegate' }],
            },
        });
        assert.equal(manifest.CPSupportsInstrumentClusterNavigationScene, true);
        assert.equal(
            manifest.UISceneConfigurations
                .CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication[0]
                .UISceneDelegateClassName,
            'ClusterSceneDelegate',
        );
        assert.equal(manifest.CPSupportsDashboardNavigationScene, true);
        assert.ok(
            manifest.UISceneConfigurations
                .CPTemplateApplicationDashboardSceneSessionRoleApplication,
        );
        assert.ok(
            manifest.UISceneConfigurations
                .CPTemplateApplicationSceneSessionRoleApplication,
        );
    });

    test('keeps one Expo phone configuration when upgrading an existing CarPlay manifest', () => {
        const phoneRole = 'UIWindowSceneSessionRoleApplication';
        const secondary = {
            UISceneConfigurationName: 'SecondaryWindow',
            UISceneDelegateClassName: 'SecondaryWindowDelegate',
        };
        const manifest = mergeCarPlaySceneManifest({
            UISceneConfigurations: {
                [phoneRole]: [
                    {
                        UISceneConfigurationName: 'Default Configuration',
                        UISceneDelegateClassName:
                            '$(PRODUCT_MODULE_NAME).SceneDelegate',
                    },
                    {
                        UISceneConfigurationName: 'WindowApplication',
                        UISceneDelegateClassName:
                            'DAFWindowApplicationSceneDelegate',
                    },
                    secondary,
                ],
            },
        });
        const [phone, ...others] = manifest.UISceneConfigurations[phoneRole];
        assert.equal(phone.UISceneConfigurationName, 'Default Configuration');
        assert.equal(
            phone.UISceneDelegateClassName,
            'DAFWindowApplicationSceneDelegate',
        );
        assert.deepEqual(others, [secondary]);
        assert.deepEqual(mergeCarPlaySceneManifest(manifest), manifest);
    });

    test('starts the shared host when CarPlay connects before a phone window exists', () => {
        const delegate = addAutoPlayRootViewToAppDelegate(
            currentExpoAppDelegateFixture,
        );
        assert.match(delegate, /UIScene\.willConnectNotification/);
        for (const scene of [
            'CPTemplateApplicationScene',
            'CPTemplateApplicationDashboardScene',
            'CPTemplateApplicationInstrumentClusterScene',
        ]) {
            assert.ok(delegate.includes('is ' + scene));
        }
        assert.match(delegate, /rootViewFactory\.initializeReactHost\(/);
        assert.doesNotMatch(delegate, /startReactNative\(/);
    });

    test('applies Info.plist changes idempotently', () => {
        const initialInfoPlist = {
            CFBundleURLTypes: [
                {
                    CFBundleURLName: 'existing',
                    CFBundleURLSchemes: ['existing-scheme'],
                },
            ],
            UIApplicationSceneManifest: {
                UISceneConfigurations: {},
            },
        };

        const firstResult = applyCarPlayInfoPlist(
            initialInfoPlist,
            'org.example.autoplay',
        );
        const secondResult = applyCarPlayInfoPlist(
            firstResult,
            'org.example.autoplay',
        );

        assert.deepEqual(secondResult, firstResult);
        assert.deepEqual(
            secondResult.CFBundleURLTypes.flatMap(
                (urlType) => urlType.CFBundleURLSchemes,
            ),
            ['existing-scheme', 'org.example.autoplay'],
        );
    });

    test('injects the current Expo AppDelegate fixture idempotently', () => {
        const firstResult = addAutoPlayRootViewToAppDelegate(
            currentExpoAppDelegateFixture,
        );
        const secondResult = addAutoPlayRootViewToAppDelegate(firstResult);

        assert.equal(secondResult, firstResult);
        assert.match(
            firstResult,
            /@generated begin react-native-auto-play-root-view/,
        );
        assert.match(firstResult, /getRootViewForAutoplay/);
        assert.match(
            firstResult,
            /bundleConfiguration: RCTBundleConfiguration\.default\(\)/,
        );
        assert.match(firstResult, /didFinishLaunchingWithOptions/);
        assert.equal(
            firstResult.match(
                /@generated begin react-native-auto-play-root-view/g,
            ).length,
            1,
        );
    });

    test('inherits Expo phone startup and deep links while forwarding visibility to Auto Play', () => {
        const delegate = addExpoWindowSceneDelegateToAppDelegate(
            currentExpoAppDelegateFixture,
        );
        assert.equal(
            addExpoWindowSceneDelegateToAppDelegate(delegate),
            delegate,
        );
        assert.match(delegate, /@objc\(DAFWindowApplicationSceneDelegate\)/);
        assert.match(
            delegate,
            /class DAFWindowApplicationSceneDelegate: SceneDelegate/,
        );
        assert.doesNotMatch(delegate, /autoPlayDelegate\.scene\?\(/);
        assert.match(delegate, /super\.sceneDidEnterBackground\(scene\)/);
        assert.match(
            delegate,
            /autoPlayDelegate\.sceneDidEnterBackground\?\(scene\)/,
        );
        assert.equal(
            delegate.match(/@generated begin daf-expo-window-scene/g)?.length,
            1,
        );
    });
    test('fails clearly for an unsupported AppDelegate template', () => {
        assert.throws(
            () =>
                addAutoPlayRootViewToAppDelegate(
                    'final class AppDelegate: ExpoAppDelegate {}',
                ),
            /could not find "class AppDelegate: ExpoAppDelegate \{"/,
        );
    });
});
