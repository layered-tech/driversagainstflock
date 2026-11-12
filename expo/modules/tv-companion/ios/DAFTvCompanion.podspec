require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'DAFTvCompanion'
  s.version = package['version']
  s.summary = 'Drivers Against Flock local TV companion transport'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'Drivers Against Flock'
  s.homepage = 'https://driversagainstflock.org'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/feenx/driversagainstflock.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Network', 'Security', 'CryptoKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
