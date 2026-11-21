import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../auto-play-compass-images.js', import.meta.url),
    'utf8',
);

function createHarness() {
    const context = vm.createContext({
        Image: {
            resolveAssetSource: (asset) => ({
                __packager_asset: true,
                uri: asset,
                width: 128,
                height: 128,
                scale: 1,
            }),
        },
        require: (path) => path,
    });
    vm.runInContext(
        source
            .replace(/^import .* from 'react-native';\n/m, '')
            .replaceAll('export ', ''),
        context,
    );
    return context;
}

test('CarPlay compass remains 26 points after native host tinting at every heading', () => {
    const context = createHarness();
    for (const dark of [false, true]) {
        for (let direction = 0; direction < 32; direction++) {
            const asset = context.getAutoPlayCompassNeedleImage(
                direction,
                dark,
            );
            const sized = context.getAutoPlayCompassNeedleImage(
                direction,
                dark,
                26,
            );
            assert.equal(typeof asset, 'string');
            assert.equal(sized.uri, asset);
            // RCTConvert decodes the asset at its scale. AutoPlay's tint renderer
            // uses that point size as its pixel size, then applies the scale again.
            const decodedPoints = 128 / sized.scale;
            const tintedPoints = Math.trunc(decodedPoints) / sized.scale;
            assert.ok(tintedPoints >= 25.5 && tintedPoints <= 26);
            assert.equal(sized.width, decodedPoints);
            assert.equal(sized.height, decodedPoints);
            assert.equal(sized.__packager_asset, true);
        }
    }
});

test('compass needle points north relative to the camera throughout a full rotation', () => {
    const context = createHarness();
    for (const [heading, direction] of [
        [0, 0],
        [90, 24],
        [180, 16],
        [270, 8],
        [360, 0],
        [-90, 8],
        [450, 24],
    ]) {
        assert.equal(
            context.getAutoPlayCompassNorthDirection(heading),
            direction,
        );
    }
    for (let index = 0; index < 32; index++) {
        assert.equal(
            context.getAutoPlayCompassNorthDirection(index * 11.25),
            (32 - index) % 32,
        );
    }
});
