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

const PLUGIN_NAME = "with-cocoapods-http1";
const PLUGIN_VERSION = "1.0.0";
const TAG = "cocoapods-http1-cdn";
// CocoaPods 1.16.2 forces CDN requests over HTTP/2, which can fail against jsDelivr.
const RUBY_PATCH = `
require 'cocoapods-core/cdn_source'

class ::Pod::CDNSource
  private

  def download_typhoeus_impl_async(file_remote_url, etag, *)
    require 'typhoeus'

    request = Typhoeus::Request.new(
      file_remote_url,
      :method => :get,
      :http_version => :httpv1_1,
      :timeout => 10,
      :connecttimeout => 10,
      :accept_encoding => 'gzip',
      :netrc => :optional,
      :netrc_file => Netrc.default_path,
      :headers => etag.nil? ? {} : { 'If-None-Match' => etag },
    )

    future = Promises.resolvable_future_on(HYDRA_EXECUTOR)
    queue_request(request)
    request.on_complete do |response|
      future.fulfill(response)
    end

    future
  end
end
`;

function addGeneratedBlock(source, tag, block) {
    const header = `# @generated begin ${tag}`;
    const footer = `# @generated end ${tag}`;
    const pattern = new RegExp(
        `\\n?# @generated begin ${tag}[\\s\\S]*?# @generated end ${tag}\\n?`,
        "m",
    );
    const sanitizedSource = source.replace(pattern, "\n").trimStart();

    return `${header}\n${block.trim()}\n${footer}\n${sanitizedSource}`;
}

function withCocoaPodsHttp1(config) {
    return withPodfile(config, (nextConfig) => {
        nextConfig.modResults.contents = addGeneratedBlock(
            nextConfig.modResults.contents,
            TAG,
            RUBY_PATCH,
        );

        return nextConfig;
    });
}

module.exports = createRunOncePlugin(
    withCocoaPodsHttp1,
    PLUGIN_NAME,
    PLUGIN_VERSION,
);
