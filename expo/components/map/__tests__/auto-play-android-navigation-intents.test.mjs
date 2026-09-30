import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveAutoPlayVoiceRequestType } from '../../auto-play-voice-request-type.js';

const packageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );
const readPackageSource = (path) =>
    readFileSync(join(packageRoot, path), 'utf8');
const appSource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const androidPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
    'utf8',
);
const androidSessionSource = readPackageSource(
    'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoSession.kt',
);
const hybridSource = readPackageSource(
    'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/HybridAutoPlay.kt',
);
const searchTemplateSource = readPackageSource(
    'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/SearchTemplate.kt',
);

test('upstream Android Auto supplies coordinates and query for later host intents', () => {
    assert.ok(
        /override fun onNewIntent\(intent: Intent\)[\s\S]*?CarContext\.ACTION_NAVIGATE/.test(
            androidSessionSource,
        ),
    );
    assert.ok(
        /HybridAutoPlay\.emitVoiceInput\(location, query\)/.test(
            androidSessionSource,
        ),
    );
    assert.ok(
        /addListenerVoiceInput\(callback: \(Location\?, String\?\) -> Unit\)/.test(
            hybridSource,
        ),
    );
    assert.ok(
        /addListenerVoiceInput\(\s*\(coordinates, query\) => onVoiceNavigation\(coordinates, query\)/.test(
            androidPlatformSource,
        ),
    );
});

test('unclassified native requests use the app safe search or preview path', () => {
    assert.equal(resolveAutoPlayVoiceRequestType(), 'search');
    assert.equal(
        resolveAutoPlayVoiceRequestType({ hasDestinationCoordinates: true }),
        'directions',
    );
    assert.ok(
        /function handleVoiceNavigationWhenReady[\s\S]*?!rootMapTemplateIsReady[\s\S]*?pendingVoiceNavigation/.test(
            appSource,
        ),
    );
    assert.ok(
        /rootMapTemplateIsReady = true;[\s\S]*?replayPendingVoiceNavigation\(\)/.test(
            appSource,
        ),
    );
});

test('Android Auto in-app search still uses the SearchTemplate submission callback', () => {
    assert.ok(
        /SearchTemplate\.Builder\(object : SearchCallback[\s\S]*?override fun onSearchSubmitted\(searchText: String\)[\s\S]*?config\.onSearchTextSubmitted\(searchText\)/.test(
            searchTemplateSource,
        ),
    );
    assert.ok(
        /onSearchTextSubmitted: \(searchText\) => \{\s*return runSubmittedSearch\(searchText\)/.test(
            appSource,
        ),
    );
});

test('Android Auto keeps the app error and loading flows for voice requests', () => {
    assert.ok(
        /function handleVoiceNavigationWhenReady[\s\S]*?voiceNavigationRequestGeneration \+= 1[\s\S]*?cancelAutoPlaySearchWork\(\)/.test(
            appSource,
        ),
    );
    assert.ok(
        /async function handleVoiceNavigation[\s\S]*?showAutoPlayError\(\s*'Voice search unavailable'/.test(
            appSource,
        ),
    );
    assert.ok(
        /createErrorTemplate\([\s\S]*?new InformationTemplate\(/.test(
            androidPlatformSource,
        ),
    );
});
