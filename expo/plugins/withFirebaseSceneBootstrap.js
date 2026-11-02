const { createRunOncePlugin, withAppDelegate } = require('expo/config-plugins');

function configureFirebaseBeforeSceneStartup(source) {
    if (source.includes('FirebaseApp.configure()')) {
        return source;
    }

    const anchor = '    let delegate = ReactNativeDelegate()';
    if (!source.includes(anchor)) {
        throw new Error(
            'Firebase scene bootstrap requires the Expo AppDelegate factory.',
        );
    }

    const contents = source.includes('import FirebaseCore')
        ? source
        : source.replace(
              /^(?:internal )?import Expo$/m,
              '$&\nimport FirebaseCore',
          );
    return contents.replace(anchor, `    FirebaseApp.configure()\n${anchor}`);
}

function withFirebaseSceneBootstrap(config) {
    return withAppDelegate(config, (nextConfig) => {
        nextConfig.modResults.contents = configureFirebaseBeforeSceneStartup(
            nextConfig.modResults.contents,
        );
        return nextConfig;
    });
}

module.exports = Object.assign(
    createRunOncePlugin(
        withFirebaseSceneBootstrap,
        'with-firebase-scene-bootstrap',
        '1.0.0',
    ),
    { configureFirebaseBeforeSceneStartup },
);
