const { readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const ORIGINAL_COMPLETION = 'completionHandler(error, image)';
const NORMALIZED_COMPLETION = `// DAF: local asset loaders can ignore the requested UIImage scale.
            // Preserve pixels and orientation while enforcing Mapbox's image density.
            let normalizedImage: UIImage?
            if let image = image, let cgImage = image.cgImage {
              normalizedImage = UIImage(cgImage: cgImage, scale: CGFloat(weakSelf.scale), orientation: image.imageOrientation)
            } else {
              normalizedImage = image
            }
            completionHandler(error, normalizedImage)`;

function normalizeMapboxImageScale(source) {
    if (source.includes(NORMALIZED_COMPLETION)) {
        return source;
    }
    if (!source.includes(ORIGINAL_COMPLETION)) {
        throw new Error(
            '[with-mapbox-image-scale] Unable to find the image loader completion.',
        );
    }
    return source.replace(ORIGINAL_COMPLETION, NORMALIZED_COMPLETION);
}

async function patchMapboxImageScale(projectRoot) {
    const projectRequire = createRequire(
        path.join(projectRoot, 'package.json'),
    );
    const packageRoot = path.dirname(
        projectRequire.resolve('@rnmapbox/maps/package.json'),
    );
    const target = path.join(packageRoot, 'ios/RNMBX/RNMBXImageQueue.swift');
    const source = await readFile(target, 'utf8');
    const patched = normalizeMapboxImageScale(source);
    if (source !== patched) {
        await writeFile(target, patched);
    }
}

module.exports = function withMapboxImageScale(config) {
    return withDangerousMod(config, [
        'ios',
        async (mod) => {
            await patchMapboxImageScale(mod.modRequest.projectRoot);
            return mod;
        },
    ]);
};

module.exports.normalizeMapboxImageScale = normalizeMapboxImageScale;
module.exports.patchMapboxImageScale = patchMapboxImageScale;
