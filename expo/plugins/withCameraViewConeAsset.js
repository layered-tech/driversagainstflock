const { copyFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

async function copyCameraViewConeAsset(projectRoot, platformProjectRoot) {
    const assetsDirectory = path.join(
        platformProjectRoot,
        'app/src/main/assets',
    );
    await mkdir(assetsDirectory, { recursive: true });
    await copyFile(
        path.join(projectRoot, 'assets/map/camera-view-cone.glb'),
        path.join(assetsDirectory, 'camera-view-cone.glb'),
    );
}

module.exports = function withCameraViewConeAsset(config) {
    return withDangerousMod(config, [
        'android',
        async (mod) => {
            await copyCameraViewConeAsset(
                mod.modRequest.projectRoot,
                mod.modRequest.platformProjectRoot,
            );
            return mod;
        },
    ]);
};

module.exports.copyCameraViewConeAsset = copyCameraViewConeAsset;
