import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );

const virtualRendererSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/VirtualRenderer.kt',
    ),
    'utf8',
);
const autoPlayMapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
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
        /private fun stop\(\)[\s\S]*?stopReactSurface\(\)/,
    );
    assert.match(
        virtualRendererSource,
        /@MainThread[\s\S]*?private fun stopReactSurface\(\)[\s\S]*?reactSurfaceId\?\.let[\s\S]*?uiManager\?\.stopSurface\(it\)/,
    );
});

test('Android Auto restores shared Fabric lifecycle ownership after the last car surface', () => {
    assert.match(
        virtualRendererSource,
        /private fun acquireFabricLifecycle[\s\S]*?surfaceCount \+= 1[\s\S]*?removeLifecycleEventListener\(fabricUiManager\)[\s\S]*?fabricUiManager\.onHostResume\(\)/,
    );
    assert.match(
        virtualRendererSource,
        /private fun releaseFabricLifecycle[\s\S]*?surfaceCount -= 1[\s\S]*?surfaceCount > 0[\s\S]*?addLifecycleEventListener\(fabricUiManager\)[\s\S]*?LifecycleState\.RESUMED[\s\S]*?fabricUiManager\.onHostPause\(\)/,
    );
    assert.match(
        virtualRendererSource,
        /stopReactSurface[\s\S]*?releaseFabricLifecycle\(lifecycleManager\)/,
    );
});

test('Android Auto retries the initial marker load when the map becomes ready', () => {
    assert.match(
        autoPlayMapSurfaceSource,
        /const handleMapLoaded = useCallback\(\(\) => \{[\s\S]*?markerLoadsEnabledRef\.current = true;[\s\S]*?latestMapBoundsRef\.current[\s\S]*?scheduleMarkerLoad\(latestMapBoundsRef\.current, 0\);/,
    );
});

test('Android Auto remounts route and marker sources after map attachment', () => {
    assert.match(
        mapCanvasSource,
        /key=\{`directions-route-source-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
    assert.match(
        mapCanvasSource,
        /key=\{`\$\{markerClusteredSourceID\}-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
    assert.match(
        mapCanvasSource,
        /key=\{`\$\{markerUnclusteredSourceID\}-\$\{locationPuckMapLoadEpoch\}`\}/,
    );
});
