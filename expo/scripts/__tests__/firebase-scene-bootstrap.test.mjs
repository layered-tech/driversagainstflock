import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
    configureFirebaseBeforeSceneStartup,
} = require('../../plugins/withFirebaseSceneBootstrap.js');

test('SDK 58 initializes Firebase before the React factory and scene startup', () => {
    const source = `internal import Expo
@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  public override func application() -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    return super.application()
  }
}`;
    const configured = configureFirebaseBeforeSceneStartup(source);
    assert.match(configured, /import FirebaseCore/);
    assert.ok(
        configured.indexOf('FirebaseApp.configure()') <
            configured.indexOf('let factory'),
    );
    assert.equal(configureFirebaseBeforeSceneStartup(configured), configured);
});

test('preserves Firebase initialization supplied by the upstream plugin', () => {
    const configured = 'import FirebaseCore\nFirebaseApp.configure()';
    assert.equal(configureFirebaseBeforeSceneStartup(configured), configured);
});

test('fails clearly when the Expo factory startup cannot be located', () => {
    assert.throws(
        () => configureFirebaseBeforeSceneStartup('import Expo'),
        /requires the Expo AppDelegate factory/,
    );
});
