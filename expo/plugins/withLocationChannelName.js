const { readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

function nameLocationChannel(source) {
    if (source.includes('channel.name = "Background Location Tracking"')) {
        return source;
    }

    const start = source.indexOf('  private fun prepareChannel(id: String?) {');
    const end = source.indexOf('\n  }', start);
    if (start === -1 || end === -1) {
        throw new Error(
            '[with-location-channel-name] Cannot find prepareChannel.',
        );
    }

    const original = source.slice(start, end);
    const updated =
        original
            .replace(
                '    val appName = applicationInfo.loadLabel(packageManager).toString()\n',
                '',
            )
            .replace(
                'NotificationChannel(id, appName,',
                'NotificationChannel(id, "Background Location Tracking",',
            )
            .replace(
                '      notificationManager.createNotificationChannel(channel)\n',
                '',
            ) +
        '\n    channel.name = "Background Location Tracking"\n    notificationManager.createNotificationChannel(channel)';

    if (
        !updated.includes(
            'NotificationChannel(id, "Background Location Tracking",',
        )
    ) {
        throw new Error(
            '[with-location-channel-name] Location channel implementation changed.',
        );
    }

    return source.slice(0, start) + updated + source.slice(end);
}

async function patchLocationChannelName(projectRoot) {
    const projectRequire = createRequire(
        path.join(projectRoot, 'package.json'),
    );
    const root = path.dirname(
        projectRequire.resolve('expo-location/package.json'),
    );
    const target = path.join(
        root,
        'android/src/main/java/expo/modules/location/services/LocationTaskService.kt',
    );
    const source = await readFile(target, 'utf8');
    const updated = nameLocationChannel(source);
    if (source !== updated) {
        await writeFile(target, updated);
    }
}

module.exports = function withLocationChannelName(config) {
    return withDangerousMod(config, [
        'android',
        async (mod) => {
            await patchLocationChannelName(mod.modRequest.projectRoot);
            return mod;
        },
    ]);
};

module.exports.nameLocationChannel = nameLocationChannel;
module.exports.patchLocationChannelName = patchLocationChannelName;
