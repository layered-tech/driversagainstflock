const { createRequire } = require('module');

function requireConfigPlugins() {
    try {
        return require('expo/config-plugins');
    } catch {
        return createRequire(`${process.cwd()}/package.json`)(
            'expo/config-plugins',
        );
    }
}

const { createRunOncePlugin, withPodfile } = requireConfigPlugins();

const PLUGIN_NAME = 'with-unique-cocoapods-uuids';
const PLUGIN_VERSION = '1.0.0';
const TAG = 'unique-cocoapods-uuids';
const RUBY_PATCH = `
require 'securerandom'

class ::Pod::Project
  def generate_available_uuid_list(count = 100)
    existing_uuids = @generated_uuids + uuids
    new_uuids = []

    while new_uuids.length < count
      uuid = SecureRandom.hex(12).upcase
      new_uuids << uuid unless existing_uuids.include?(uuid) || new_uuids.include?(uuid)
    end

    @generated_uuids += new_uuids
    @available_uuids += new_uuids
  end
end
`;

function addUniqueCocoaPodsUuids(source) {
    const header = `# @generated begin ${TAG}`;
    const footer = `# @generated end ${TAG}`;
    const pattern = new RegExp(
        `\\n?# @generated begin ${TAG}[\\s\\S]*?# @generated end ${TAG}\\n?`,
        'm',
    );
    const sanitizedSource = source.replace(pattern, '\n').trimStart();

    return `${header}\n${RUBY_PATCH.trim()}\n${footer}\n${sanitizedSource}`;
}

function withUniqueCocoaPodsUuids(config) {
    return withPodfile(config, (nextConfig) => {
        nextConfig.modResults.contents = addUniqueCocoaPodsUuids(
            nextConfig.modResults.contents,
        );

        return nextConfig;
    });
}

module.exports = createRunOncePlugin(
    withUniqueCocoaPodsUuids,
    PLUGIN_NAME,
    PLUGIN_VERSION,
);
module.exports.addUniqueCocoaPodsUuids = addUniqueCocoaPodsUuids;
