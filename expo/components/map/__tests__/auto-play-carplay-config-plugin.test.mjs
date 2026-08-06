import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const carPlayAutoPlayPlugin = require('../../../plugins/withCarPlayAutoPlay.js');
const {
    addAutoPlayRootViewToAppDelegate,
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
                UISceneDelegateClassName: 'WindowApplicationSceneDelegate',
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
        assert.match(firstResult, /didFinishLaunchingWithOptions/);
        assert.equal(
            firstResult.match(
                /@generated begin react-native-auto-play-root-view/g,
            ).length,
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
