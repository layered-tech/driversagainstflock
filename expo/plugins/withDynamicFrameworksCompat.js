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

const { createRunOncePlugin, withPodfile } = requireConfigPlugins();

const PLUGIN_NAME = "with-dynamic-frameworks-compat";
const PLUGIN_VERSION = "1.0.0";

const FIREBASE_TAG = "dynamic-frameworks-firebase-static";
const POSTINSTALL_TAG = "dynamic-frameworks-clang-compat";

// MapboxMaps is a pure-Swift SPM package shared (via SPM) by @rnmapbox/maps and the Navigation SDK.
// Under static linking it is archived into every consuming pod, producing thousands of duplicate
// symbols at link time, so the app uses `useFrameworks: "dynamic"` (see app.config.js). Dynamic
// frameworks then require two compatibility shims for React Native Firebase, which this plugin injects
// into the Expo-generated Podfile so they survive `expo prebuild`:
//
//   1. $RNFirebaseAsStaticFramework — Firebase/GoogleAppMeasurement ship as precompiled *static*
//      xcframeworks and cannot be built as dynamic frameworks, so RNFB is kept static within the
//      dynamic setup.
//   2. A post_install pass that (a) allows non-modular React headers inside framework modules and
//      (b) disables the Clang module system for the RNFB Objective-C pods. RN 0.83 ships a prebuilt
//      React that is not a real Clang module, so RNFBApp's framework module otherwise absorbs React
//      types (RCTBridgeModule) and RNFBAnalytics fails with "must be imported from module
//      'RNFBApp.RNFBAppModule' before it is required". RNFB uses textual #import (not @import), so
//      disabling modules for those pods makes the includes textual and sidesteps the check.
//
// Both are gated on use_frameworks! being active, so the plugin is a no-op if the app ever returns to
// static linking.

const FIREBASE_BLOCK = `$RNFirebaseAsStaticFramework = true if podfile_properties['ios.useFrameworks'] || ENV['USE_FRAMEWORKS']`;

const POSTINSTALL_BLOCK = `  if podfile_properties['ios.useFrameworks'] || ENV['USE_FRAMEWORKS']
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
      if target.name.start_with?('RNFB')
        target.build_configurations.each do |config|
          config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        end
      end
    end
  end`;

/**
 * Inserts an idempotent `@generated` block into `source` immediately after the first line matching
 * `anchor`. Re-running replaces any previous block with the same `tag`.
 */
function insertGeneratedBlock(source, tag, block, anchor) {
    const header = `# @generated begin ${tag}`;
    const footer = `# @generated end ${tag}`;
    const pattern = new RegExp(
        `\\n?# @generated begin ${tag}[\\s\\S]*?# @generated end ${tag}\\n?`,
        "m",
    );
    const sanitizedSource = source.replace(pattern, "\n");
    const match = sanitizedSource.match(anchor);

    if (!match || match.index == null) {
        throw new Error(
            `[with-dynamic-frameworks-compat] Unable to find the anchor for "${tag}" in the Podfile. ` +
                "The Podfile template may have changed; update plugins/withDynamicFrameworksCompat.js.",
        );
    }

    const insertionIndex = match.index + match[0].length;
    const wrappedBlock = `${header}\n${block.trim()}\n${footer}\n`;

    return `${sanitizedSource.slice(0, insertionIndex)}${wrappedBlock}${sanitizedSource.slice(
        insertionIndex,
    )}`;
}

function withDynamicFrameworksCompat(config) {
    return withPodfile(config, (nextConfig) => {
        let contents = insertGeneratedBlock(
            nextConfig.modResults.contents,
            FIREBASE_TAG,
            FIREBASE_BLOCK,
            /prepare_react_native_project!.*\n/,
        );

        contents = insertGeneratedBlock(
            contents,
            POSTINSTALL_TAG,
            POSTINSTALL_BLOCK,
            /post_install do \|installer\|.*\n/,
        );

        nextConfig.modResults.contents = contents;

        return nextConfig;
    });
}

module.exports = createRunOncePlugin(
    withDynamicFrameworksCompat,
    PLUGIN_NAME,
    PLUGIN_VERSION,
);
