import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

test('Duo rail uses transparent design artwork at native 1x, 2x and 3x sizes', () => {
    const names = [
        'plus',
        'minus',
        'recenter',
        'pencil',
        'navigation',
        'menu',
        'x',
        'map',
        'route',
        'filters',
    ];
    const mocks = Object.fromEntries(
        names.map((name) => [`../../assets/map/rail-${name}.png`, name]),
    );
    const { getDuoRailIcon } = loadTourModule(
        new URL('../duo-rail-icons.js', import.meta.url),
        mocks,
    );
    assert.deepEqual(getDuoRailIcon('scope'), {
        type: 'templateSource',
        templateSource: 'recenter',
    });
    assert.equal(getDuoRailIcon('location.north').templateSource, 'navigation');
    assert.equal(getDuoRailIcon('slider.vertical.3').templateSource, 'filters');
    assert.equal(getDuoRailIcon('unknown'), undefined);
    for (const name of names) {
        const points = ['plus', 'minus'].includes(name) ? 22 : 20;
        for (const scale of [1, 2, 3]) {
            const suffix = scale === 1 ? '' : `@${scale}x`;
            const png = readFileSync(
                new URL(
                    `../../../assets/map/rail-${name}${suffix}.png`,
                    import.meta.url,
                ),
            );
            assert.equal(png.readUInt32BE(16), points * scale);
            assert.equal(png.readUInt32BE(20), points * scale);
            assert.equal(
                png[25],
                6,
                'RGBA artwork keeps its transparent background',
            );
        }
    }
});
