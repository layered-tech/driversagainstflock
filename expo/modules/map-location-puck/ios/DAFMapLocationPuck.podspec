require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'DAFMapLocationPuck'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'Drivers Against Flock'
  s.homepage = 'https://driversagainstflock.com'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/feenx/driversagainstflock.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MapboxMaps', '= 11.20.2'

  s.source_files = '**/*.swift'
  s.resources = 'navigation_puck.glb'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
