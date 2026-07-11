require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RNMapboxNavigation'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license'] || 'MIT'
  s.author         = package['author'] || 'feenx'
  s.homepage       = package['homepage'] || 'https://github.com/feenx/mapbox-navigation'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/feenx/mapbox-navigation.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # NOTE: `MapboxMaps` and `MapboxNavigationCore` are NOT declared as CocoaPods dependencies here.
  # The Mapbox Navigation SDK v3 Swift layer (MapboxNavigationCore / MapboxDirections) is distributed
  # via Swift Package Manager only — it is not published to the CocoaPods trunk. The `mapbox-navigation-ios`
  # and `mapbox-maps-ios` Swift packages are added to this pod target by the config plugin
  # (`plugin/withMapboxNavigation.js`) during `expo prebuild` / `pod install`, so that `import MapboxMaps`
  # and `import MapboxNavigationCore` resolve. This keeps a single MapboxMaps (shared with @rnmapbox/maps,
  # which is also switched to SPM by the same plugin).

  # Resolved relative to this podspec's directory (mapbox-navigation/ios), so glob from here — NOT
  # 'ios/**' (that would look for ios/ios/** and match nothing, producing a source-less aggregate
  # target without `package_product_dependencies`).
  s.source_files = '**/*.{h,m,mm,swift}'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
