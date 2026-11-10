const { readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

function preserveUnavailableSpeed(source) {
    const original = 'speed = location.speed.toDouble()';
    const guarded =
        'speed = if (location.hasSpeed()) location.speed.toDouble() else null';
    const conversions = source.match(/speed = [^\n]+/g) ?? [];

    if (conversions.length !== 1) {
        throw new Error(
            '[with-android-location-speed] Location speed conversion changed.',
        );
    }

    if (conversions[0].trim() === guarded) {
        return source;
    }

    if (conversions[0].trim() !== original) {
        throw new Error(
            '[with-android-location-speed] Location speed conversion changed.',
        );
    }

    return source.replace(original, guarded);
}

async function patchAndroidLocationSpeed(projectRoot) {
    const projectRequire = createRequire(
        path.join(projectRoot, 'package.json'),
    );
    const root = path.dirname(
        projectRequire.resolve('expo-location/package.json'),
    );
    const target = path.join(
        root,
        'android/src/main/java/expo/modules/location/records/LocationResults.kt',
    );
    const source = await readFile(target, 'utf8');
    const updated = preserveUnavailableSpeed(source);

    if (source !== updated) {
        await writeFile(target, updated);
    }
}

module.exports = function withAndroidLocationSpeed(config) {
    return withDangerousMod(config, [
        'android',
        async (mod) => {
            await patchAndroidLocationSpeed(mod.modRequest.projectRoot);
            return mod;
        },
    ]);
};

module.exports.preserveUnavailableSpeed = preserveUnavailableSpeed;
module.exports.patchAndroidLocationSpeed = patchAndroidLocationSpeed;
