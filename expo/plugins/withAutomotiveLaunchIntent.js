const { readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

function replaceRequired(source, before, after) {
    if (!source.includes(before))
        throw new Error(
            'Auto Play launch-intent patch no longer matches the installed package.',
        );
    return source.replace(before, after);
}

function patchSession(source) {
    if (!source.includes('// DAF Automotive cold-launch intent'))
        source = replaceRequired(
            source,
            '        return screen\n',
            `        // DAF Automotive cold-launch intent: onNewIntent alone misses a fresh session.
        if (clusterId == null && carContext.packageManager.hasSystemFeature("android.hardware.type.automotive")) {
            onNewIntent(intent)
        }

        return screen
`,
        );
    if (source.includes('// DAF Automotive coordinate intents')) return source;
    source = replaceRequired(
        source,
        '        if (action == CarContext.ACTION_NAVIGATE) {',
        `        // DAF Automotive coordinate intents also support the declared geo VIEW action.
        val isAutomotiveNavigation = carContext.packageManager.hasSystemFeature("android.hardware.type.automotive")
        if (action == CarContext.ACTION_NAVIGATE || (isAutomotiveNavigation && action == Intent.ACTION_VIEW && intent.data?.scheme == "geo")) {`,
    );
    source = replaceRequired(
        source,
        `                        parseCoordinates(coordinatesPart)
                    } else {
                        null
                    }`,
        `                        parseCoordinates(coordinatesPart)
                    } else {
                        if (isAutomotiveNavigation) parseCoordinates(schemeSpecificPart.substringBefore('?')) else null
                    }`,
    );
    return replaceRequired(
        source,
        `                    } else {
                        java.net.URLDecoder.decode(schemeSpecificPart, "UTF-8")
                    }`,
        `                    } else if (isAutomotiveNavigation && location != null) {
                        null
                    } else {
                        java.net.URLDecoder.decode(schemeSpecificPart, "UTF-8")
                    }`,
    );
}

function patchBridge(source) {
    if (source.includes('// DAF Automotive pending navigation intent'))
        return source;
    source = replaceRequired(
        source,
        '        private val voiceInputListeners = CopyOnWriteArrayList<(Location?, String?) -> Unit>()',
        `        private val voiceInputListeners = CopyOnWriteArrayList<(Location?, String?) -> Unit>()

        // DAF Automotive pending navigation intent; survives initial hybrid construction.
        private var pendingVoiceInput: Pair<Location?, String?>? = null`,
    );
    source = replaceRequired(
        source,
        '        voiceInputListeners.add(callback)',
        `        synchronized(voiceInputListeners) {
            voiceInputListeners.add(callback)
            pendingVoiceInput?.let { pending ->
                pendingVoiceInput = null
                callback(pending.first, pending.second)
            }
        }`,
    );
    return replaceRequired(
        source,
        `        fun emitVoiceInput(location: Location?, query: String?) {
            voiceInputListeners.forEach {
                it(location, query)
            }
        }`,
        `        fun emitVoiceInput(location: Location?, query: String?) {
            synchronized(voiceInputListeners) {
                if (voiceInputListeners.isEmpty() && AndroidAutoSession.getRootContext()?.packageManager?.hasSystemFeature("android.hardware.type.automotive") == true) {
                    pendingVoiceInput = Pair(location, query)
                } else {
                    voiceInputListeners.forEach { it(location, query) }
                }
            }
        }`,
    );
}

async function patchAutomotiveLaunchIntent(projectRoot) {
    const requireFromProject = createRequire(
        path.join(projectRoot, 'package.json'),
    );
    const packageRoot = path.dirname(
        requireFromProject.resolve(
            '@iternio/react-native-auto-play/package.json',
        ),
    );
    const sourceRoot = path.join(
        packageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay',
    );
    for (const [name, patch] of [
        ['AndroidAutoSession.kt', patchSession],
        ['HybridAutoPlay.kt', patchBridge],
    ]) {
        const file = path.join(sourceRoot, name);
        const source = await readFile(file, 'utf8');
        const next = patch(source);
        if (source !== next) await writeFile(file, next);
    }
}

module.exports = function withAutomotiveLaunchIntent(config) {
    return withDangerousMod(config, [
        'android',
        async (mod) => {
            await patchAutomotiveLaunchIntent(mod.modRequest.projectRoot);
            return mod;
        },
    ]);
};
module.exports.__testables = { patchSession, patchBridge };
module.exports.patchAutomotiveLaunchIntent = patchAutomotiveLaunchIntent;
