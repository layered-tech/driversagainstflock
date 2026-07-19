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
const androidAutoSessionSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoSession.kt',
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

test('Android Auto registers its Fabric surface with ReactHost', () => {
    assert.match(
        virtualRendererSource,
        /private var reactSurface: ReactSurface\? = null/,
    );
    assert.match(
        virtualRendererSource,
        /\(context\.applicationContext as\? ReactApplication\)\?\.reactHost[\s\S]*?reactHost\.createSurface\([\s\S]*?it\.start\(\)/,
    );
    assert.doesNotMatch(
        virtualRendererSource,
        /fabricUiManager\.startSurface|fabricUiManager\.stopSurface/,
    );
    assert.match(
        virtualRendererSource,
        /private fun stop\(\) \{[\s\S]*?reactSurface\?\.let \{[\s\S]*?it\.stop\(\)/,
    );
    assert.doesNotMatch(virtualRendererSource, /it\.stop\(\)\s*it\.clear\(\)/);
});

test('Android Auto keeps the host surface across transient car display replacement', () => {
    assert.match(
        virtualRendererSource,
        /override fun onSurfaceDestroyed\([^)]*\) \{\s*releaseDisplay\(\)\s*\}/,
    );
    assert.match(
        virtualRendererSource,
        /private fun releaseDisplay\(\) \{[\s\S]*?releasePresentation\(\)[\s\S]*?virtualDisplay\?\.release\(\)[\s\S]*?virtualDisplay = null/,
    );
    assert.match(
        virtualRendererSource,
        /private fun releasePresentation\(\) \{[\s\S]*?\(it\.parent as\? ViewGroup\)\?\.removeView\(it\)[\s\S]*?currentPresentation\?\.dismiss\(\)/,
    );
    assert.doesNotMatch(
        androidAutoSessionSource,
        /reactLifecycleObserver|addLifecycleEventListener/,
    );
    assert.match(
        androidAutoSessionSource,
        /override fun onDestroy[\s\S]*?VirtualRenderer\.removeRenderer\(moduleName\)/,
    );
});

test('Android Auto can render before Nitro initializes and follows React reloads', () => {
    assert.doesNotMatch(
        virtualRendererSource,
        /private fun initRenderer\(display: Display\) \{\s*val reactContext = NitroModules\.applicationContext/,
    );
    assert.match(
        virtualRendererSource,
        /ReactInstanceEventListener[\s\S]*?keepRendererActive\(context\)[\s\S]*?addReactInstanceEventListener/,
    );
    assert.match(
        virtualRendererSource,
        /removeReactInstanceEventListener\(reactInstanceEventListener\)/,
    );
    assert.match(
        virtualRendererSource,
        /reactInstanceBeforeDestroyListener[\s\S]*?stop\(\)[\s\S]*?addBeforeDestroyListener\(reactInstanceBeforeDestroyListener\)/,
    );
    assert.match(
        virtualRendererSource,
        /removeBeforeDestroyListener\(reactInstanceBeforeDestroyListener\)/,
    );
    assert.match(
        virtualRendererSource,
        /Presentation\(themedContext, display\)/,
    );
    assert.match(
        virtualRendererSource,
        /catch \(_: WindowManager\.InvalidDisplayException\) \{\s*releaseDisplay\(\)/,
    );
});

test('Android Auto cannot recreate a surface after renderer teardown', () => {
    assert.match(virtualRendererSource, /private var isStopped = false/);
    assert.match(
        virtualRendererSource,
        /override fun onSurfaceAvailable[\s\S]*?if \(isStopped \|\| !isSurfaceReady/,
    );
    assert.match(
        virtualRendererSource,
        /private fun stop\(\) \{\s*if \(isStopped\) \{\s*return\s*\}\s*isStopped = true/,
    );
});

test('the tracked AutoPlay patch carries the host-owned surface fix', () => {
    assert.match(autoPlayPatch, /reactHost\.createSurface/);
    assert.match(
        autoPlayPatch,
        /private var reactSurface: ReactSurface\? = null/,
    );
    assert.match(autoPlayPatch, /addBeforeDestroyListener/);
    assert.match(autoPlayPatch, /removeBeforeDestroyListener/);
});
