const { createRequire } = require("module");
const fs = require("fs");
const path = require("path");

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
    AndroidConfig,
    createRunOncePlugin,
    withDangerousMod,
    withGradleProperties,
    withInfoPlist,
    withPlugins,
    withProjectBuildGradle,
} = requireConfigPlugins();

const pkg = require("../package.json");

const IOS_MAPBOX_MAPS_SPM_URL = "https://github.com/mapbox/mapbox-maps-ios.git";
const IOS_MAPBOX_NAVIGATION_SPM_URL =
    "https://github.com/mapbox/mapbox-navigation-ios.git";
const IOS_MAPBOX_NAVIGATION_NATIVE_SPM_URL =
    "https://github.com/mapbox/mapbox-navigation-native-ios.git";
const IOS_DEFAULT_MAPBOX_MAPS_VERSION = "11.20.2";
const IOS_DEFAULT_NAVIGATION_VERSION = "3.20.1";
// mapbox-navigation-ios pins mapbox-navigation-native-ios EXACTly; keep in lockstep with the nav SDK.
const IOS_DEFAULT_NAVIGATION_NATIVE_VERSION = "324.20.2";
const IOS_POD_TARGET_NAME = "RNMapboxNavigation";

const MAPBOX_MAVEN_BLOCK = `
allprojects {
  repositories {
    maven {
      url 'https://api.mapbox.com/downloads/v2/releases/maven'
      def token = project.properties['MAPBOX_DOWNLOADS_TOKEN'] ?: System.getenv('RNMAPBOX_MAPS_DOWNLOAD_TOKEN')
      if (token) {
        authentication { basic(BasicAuthentication) }
        credentials {
          username = 'mapbox'
          password = token
        }
      }
    }
  }
}
`;

function addGeneratedBlock(source, tag, block) {
    const header = `// @generated begin ${tag}`;
    const footer = `// @generated end ${tag}`;
    const pattern = new RegExp(
        `\\n?// @generated begin ${tag}[\\s\\S]*?// @generated end ${tag}\\n?`,
        "m",
    );
    const sanitizedSource = source.replace(pattern, "\n");

    if (source.includes(header)) {
        return `${sanitizedSource.trimEnd()}\n${header}\n${block.trim()}\n${footer}\n`;
    }

    return `${sanitizedSource.trimEnd()}\n${header}\n${block.trim()}\n${footer}\n`;
}

function withMapboxNavigationGradleProperties(config, props = {}) {
    const keyValues = {
        RNMapboxNavigationAndroidArtifact:
            props.RNMapboxNavigationAndroidArtifact,
        RNMapboxNavigationSdkVersion: props.RNMapboxNavigationSdkVersion,
    };
    const keys = Object.keys(keyValues);

    if (!Object.values(keyValues).some(Boolean)) {
        return config;
    }

    return withGradleProperties(config, (nextConfig) => {
        nextConfig.modResults = nextConfig.modResults.filter(
            (item) => !(item.type === "property" && keys.includes(item.key)),
        );

        keys.forEach((key) => {
            const value = keyValues[key];

            if (value) {
                nextConfig.modResults.push({
                    type: "property",
                    key,
                    value: String(value),
                });
            }
        });

        return nextConfig;
    });
}

function withMapboxNavigationMaven(config) {
    return withProjectBuildGradle(config, (nextConfig) => {
        if (nextConfig.modResults.language !== "groovy") {
            return nextConfig;
        }

        if (
            nextConfig.modResults.contents.includes(
                "https://api.mapbox.com/downloads/v2/releases/maven",
            )
        ) {
            return nextConfig;
        }

        nextConfig.modResults.contents = addGeneratedBlock(
            nextConfig.modResults.contents,
            "@rnmapbox/navigation-maven",
            MAPBOX_MAVEN_BLOCK,
        );

        return nextConfig;
    });
}

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
            `[@rnmapbox/navigation] Unable to find the anchor for "${tag}" in the Podfile. ` +
                "The Podfile template may have changed; update plugin/withMapboxNavigation.js.",
        );
    }

    const insertionIndex = match.index + match[0].length;
    const wrappedBlock = `${header}\n${block.trim()}\n${footer}\n`;

    return `${sanitizedSource.slice(0, insertionIndex)}${wrappedBlock}${sanitizedSource.slice(
        insertionIndex,
    )}`;
}

/**
 * Wires the Mapbox Navigation SDK v3 into the iOS build via Swift Package Manager.
 *
 * The Navigation SDK v3 Swift layer (`MapboxNavigationCore`) is SPM-only, so it cannot be a
 * CocoaPods dependency. To keep a single `MapboxMaps` shared with `@rnmapbox/maps`, this:
 *   1. switches `@rnmapbox/maps` to its SPM `MapboxMaps` (`$RNMapboxMapsSwiftPackageManager`), and
 *   2. adds the `mapbox-maps-ios` + `mapbox-navigation-ios` Swift packages to the `RNMapboxNavigation`
 *      pod target during `post_install` (so `import MapboxMaps` / `import MapboxNavigationCore` resolve).
 */
function applyPodfileSwiftPackages(contents, { mapsVersion, navVersion, navNativeVersion }) {
    const setupBlock = `
$RNMapboxMapsSwiftPackageManager = {
  url: '${IOS_MAPBOX_MAPS_SPM_URL}',
  requirement: { kind: 'exactVersion', version: '${mapsVersion}' },
  product_name: 'MapboxMaps'
}

# Register the Swift packages the RNMapboxNavigation pod imports (MapboxMaps + MapboxNavigationCore)
# through React Native's SPM manager. On iOS, RN owns SPM wiring: during react_native_post_install it
# deletes EVERY XCRemoteSwiftPackageReference from the Pods project and re-adds only what was
# registered via spm_dependency (see react-native/scripts/cocoapods/spm.rb). Wiring the package
# references ourselves in post_install is therefore erased before the project is saved, which is why
# MapboxNavigationCore ends up unresolved ("Missing package product"). Registering via spm_dependency
# lets RN attach the product refs — and the SWIFT_INCLUDE_PATHS workaround — after its own clean.
# Navigation SDK v3's Swift layer is SPM-only, and this shares a single MapboxMaps with @rnmapbox/maps.
def rnmapbox_navigation_wire_spm(installer)
  require 'ostruct'
  require 'xcodeproj'

  maps_url = '${IOS_MAPBOX_MAPS_SPM_URL}'
  maps_requirement = { kind: 'exactVersion', version: '${mapsVersion}' }
  nav_url = '${IOS_MAPBOX_NAVIGATION_SPM_URL}'
  nav_requirement = { kind: 'exactVersion', version: '${navVersion}' }
  # mapbox-navigation-ios pins mapbox-navigation-native-ios EXACTly to this version; it must match or
  # SPM resolution conflicts. Bump in lockstep with the nav SDK version.
  native_url = '${IOS_MAPBOX_NAVIGATION_NATIVE_SPM_URL}'
  native_requirement = { kind: 'exactVersion', version: '${navNativeVersion}' }

  # spm_dependency keys the registration by spec.name and later resolves the matching pod target,
  # so a lightweight stand-in carrying the pod name is all RN's SPM manager needs here.
  # RNMapboxNavigation imports both MapboxMaps and MapboxNavigationCore.
  nav_target = OpenStruct.new(name: '${IOS_POD_TARGET_NAME}')
  spm_dependency(nav_target, url: maps_url, requirement: maps_requirement, products: ['MapboxMaps'])
  spm_dependency(nav_target, url: nav_url, requirement: nav_requirement, products: ['MapboxNavigationCore'])

  # rnmapbox-maps (RNMBX) also imports MapboxMaps. @rnmapbox/maps wires the product dependency itself
  # (rnmapbox-maps.podspec _add_spm_to_target) but never sets SWIFT_INCLUDE_PATHS, so with SPM static
  # linking the MapboxMaps import fails with a "no such module" error. Registering the pod through
  # RN's SPM manager attaches the same SWIFT_INCLUDE_PATHS search path RN gives its own SPM targets.
  spm_dependency(OpenStruct.new(name: 'rnmapbox-maps'), url: maps_url, requirement: maps_requirement, products: ['MapboxMaps'])

  # The Navigation SDK's Swift products (MapboxNavigationCore/MapboxDirections/_MapboxNavigationHelpers)
  # build as STATIC libraries here, so they are embedded into RNMapboxNavigation.framework once (above).
  # Its only DYNAMIC dependency that Xcode doesn't auto-embed is the binary MapboxNavigationNative
  # framework — without it the app links fine but crashes at launch with dyld "Library not loaded:
  # @rpath/MapboxNavigationNative.framework/MapboxNavigationNative". So the APP target depends on the
  # MapboxNavigationNative binary product (from the separate mapbox-navigation-native-ios package) to
  # embed that framework. We deliberately do NOT add MapboxNavigationCore to the app target: that would
  # statically re-link its objects into the app on top of the pod's copy → thousands of duplicate
  # symbols. The app lives in its own .xcodeproj (untouched by RN's SPM clean), so we wire it directly.
  pkg_class = Xcodeproj::Project::Object::XCRemoteSwiftPackageReference
  ref_class = Xcodeproj::Project::Object::XCSwiftPackageProductDependency
  installer.aggregate_targets.group_by(&:user_project).each do |project, aggregates|
    aggregates.each do |aggregate|
      aggregate.user_targets.each do |user_target|
        # Xcode 15/16+ stages a \`<binary>.xcframework-ios.signature\` provenance sidecar for every SPM
        # binary xcframework and, at archive time, copies each into the archive's shared \`Signatures/\`
        # folder. MapboxCommon and MapboxCoreMaps are binary xcframeworks vended by BOTH mapbox-maps-ios
        # and mapbox-navigation-native-ios — two independent package references on this app target — so
        # their identically-named sidecars collide ("MapboxCommon.xcframework-ios.signature couldn't be
        # copied to Signatures because an item with the same name already exists"). SPM has no way to
        # share one binary artifact across separate package references, so strip the sidecars after they
        # are staged. The embedded frameworks are re-signed with the app's identity, so these provenance
        # sidecars are unused at runtime and safe to delete. Appended last → runs after "[CP] Embed Pods
        # Frameworks" and before the archive's signature aggregation.
        signature_phase_name = '[Mapbox] Remove duplicate xcframework signatures'
        unless user_target.shell_script_build_phases.any? { |phase| phase.name == signature_phase_name }
          signature_phase = user_target.new_shell_script_build_phase(signature_phase_name)
          signature_phase.shell_script = %q(find "\${CONFIGURATION_BUILD_DIR}" -name '*.xcframework-ios.signature' -delete 2>/dev/null || true)
          signature_phase.always_out_of_date = '1'
        end

        # Self-correct: an earlier approach linked MapboxNavigationCore into the app target (duplicate
        # symbols vs the pod's static copy). Drop it if a prior install added it.
        user_target.package_product_dependencies.delete_if do |r|
          r.class == ref_class && r.product_name == 'MapboxNavigationCore'
        end

        pkg = project.root_object.package_references.find { |p| p.class == pkg_class && p.repositoryURL == native_url }
        unless pkg
          pkg = project.new(pkg_class)
          pkg.repositoryURL = native_url
          pkg.requirement = native_requirement
          project.root_object.package_references << pkg
        end

        next if user_target.package_product_dependencies.any? { |r| r.class == ref_class && r.package == pkg && r.product_name == 'MapboxNavigationNative' }

        ref = project.new(ref_class)
        ref.package = pkg
        ref.product_name = 'MapboxNavigationNative'
        user_target.package_product_dependencies << ref
      end
    end

    # Drop the now-unused mapbox-navigation-ios reference a prior install may have added to the app
    # project (only the Pods project needs it; the MapboxNavigationCore product dep was removed above).
    project.root_object.package_references.delete_if do |p|
      p.class == pkg_class && p.repositoryURL == nav_url
    end
  end
end
`;

    let nextContents = insertGeneratedBlock(
        contents,
        "@rnmapbox/navigation-spm-setup",
        setupBlock,
        /prepare_react_native_project!.*\n/,
    );

    nextContents = insertGeneratedBlock(
        nextContents,
        "@rnmapbox/navigation-spm-postinstall",
        "    rnmapbox_navigation_wire_spm(installer)",
        /post_install do \|installer\|.*\n/,
    );

    return nextContents;
}

function withMapboxNavigationSwiftPackages(config, props = {}) {
    const mapsVersion =
        props.RNMapboxMapsVersion || IOS_DEFAULT_MAPBOX_MAPS_VERSION;
    const navVersion =
        props.RNMapboxNavigationIosSdkVersion || IOS_DEFAULT_NAVIGATION_VERSION;
    const navNativeVersion =
        props.RNMapboxNavigationNativeVersion ||
        IOS_DEFAULT_NAVIGATION_NATIVE_VERSION;

    return withDangerousMod(config, [
        "ios",
        (nextConfig) => {
            const podfilePath = path.join(
                nextConfig.modRequest.platformProjectRoot,
                "Podfile",
            );
            const contents = fs.readFileSync(podfilePath, "utf8");
            fs.writeFileSync(
                podfilePath,
                applyPodfileSwiftPackages(contents, {
                    mapsVersion,
                    navVersion,
                    navNativeVersion,
                }),
            );

            return nextConfig;
        },
    ]);
}

function withMapboxNavigationBackgroundLocation(config) {
    return withInfoPlist(config, (nextConfig) => {
        const modes = nextConfig.modResults.UIBackgroundModes ?? [];

        if (!modes.includes("location")) {
            nextConfig.modResults.UIBackgroundModes = [...modes, "location"];
        }

        return nextConfig;
    });
}

function withMapboxNavigation(config, props = {}) {
    config = withMapboxNavigationGradleProperties(config, props);
    config = withMapboxNavigationMaven(config);

    if (props.androidForegroundServiceEnabled) {
        config = withPlugins(config, [
            [
                AndroidConfig.Permissions.withPermissions,
                [
                    "android.permission.FOREGROUND_SERVICE",
                    "android.permission.FOREGROUND_SERVICE_LOCATION",
                ],
            ],
        ]);
    }

    config = withMapboxNavigationSwiftPackages(config, props);

    if (props.iosBackgroundLocationEnabled) {
        config = withMapboxNavigationBackgroundLocation(config);
    }

    return config;
}

module.exports = createRunOncePlugin(
    withMapboxNavigation,
    pkg.name,
    pkg.version,
);
