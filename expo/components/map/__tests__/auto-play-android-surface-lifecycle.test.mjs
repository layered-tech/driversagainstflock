import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const virtualRendererSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/VirtualRenderer.kt',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayPatch = readFileSync(
    new URL(
        '../../../patches/@iternio+react-native-auto-play+0.4.7.patch',
        import.meta.url,
    ),
    'utf8',
);

test('Android Auto starts Fabric with exact automotive dimensions', () => {
    assert.match(virtualRendererSource, /ReactSurfaceImpl/);
    assert.match(virtualRendererSource, /ReactSurfaceView/);
    assert.match(
        virtualRendererSource,
        /fabricUiManager\.startSurface\([\s\S]*?Arguments\.fromBundle\(initialProperties\)[\s\S]*?width \/ reactNativeScale[\s\S]*?View\.MeasureSpec\.EXACTLY[\s\S]*?height \/ reactNativeScale[\s\S]*?View\.MeasureSpec\.EXACTLY/,
    );
    assert.doesNotMatch(virtualRendererSource, /reactHost\.createSurface/);
});

test('Android Auto stops the direct Fabric surface during teardown', () => {
    assert.match(
        virtualRendererSource,
        /private fun stop\(\)[\s\S]*?reactSurfaceId\?\.let[\s\S]*?uiManager\?\.stopSurface\(it\)/,
    );
});

test('the tracked AutoPlay patch leaves the working renderer intact', () => {
    assert.doesNotMatch(
        autoPlayPatch,
        /^diff --git .*\/VirtualRenderer\.kt .*\/VirtualRenderer\.kt$/m,
    );
    assert.doesNotMatch(autoPlayPatch, /reactHost\.createSurface/);
});
