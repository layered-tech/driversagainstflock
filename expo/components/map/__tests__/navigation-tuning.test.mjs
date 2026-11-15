import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NAVIGATION_TUNING,
    resolveNavigationTuning,
} from '../navigation-tuning.js';
import { getNavigationPuck3DScaleExpression } from '../navigation-puck-layout.js';
import { createFollowSpeedZoomController } from '../follow-zoom-update.js';

const mph = (value) => value * 0.44704;

test('puck expressions preserve the configured zoom stops', () => {
    const expression = JSON.parse(getNavigationPuck3DScaleExpression());
    assert.deepEqual(
        expression.slice(3),
        Object.entries(NAVIGATION_TUNING.base.puckScaleByZoom)
            .map(([zoom, size]) => [
                Number(zoom),
                ['literal', [size, size, size]],
            ])
            .sort(([a], [b]) => a - b)
            .flat(),
    );
});

test('every supported platform and surface inherits the unmodified baseline', () => {
    for (const [platform, config] of Object.entries(
        NAVIGATION_TUNING.platforms,
    )) {
        for (const surface of Object.keys(config.surfaces)) {
            for (const mode of surface === 'cluster'
                ? ['perspective']
                : ['perspective', 'north-up', 'route-overview']) {
                const options = { platform, surface, mode };
                const baseline = resolveNavigationTuning({ mode });
                assert.deepEqual(resolveNavigationTuning(options), baseline);
                assert.equal(baseline.puckScaleFactor, 1);
                assert.deepEqual(
                    getNavigationPuck3DScaleExpression(options),
                    getNavigationPuck3DScaleExpression({ mode }),
                );
            }
        }
    }
});

test('sparse overrides cascade by key without changing inherited or sibling values', () => {
    const phone = NAVIGATION_TUNING.platforms.android.surfaces.phone;
    phone.puckScaleByZoom = { 12: 555 };
    phone.zoomBySpeedMph = { 40: 15 };
    phone.modes['north-up'] = { puckScaleByZoom: { 12: 666 } };
    try {
        const config = resolveNavigationTuning({ mode: 'north-up' });
        assert.equal(
            config.puckScaleByZoom[9],
            NAVIGATION_TUNING.base.puckScaleByZoom[9],
        );
        assert.equal(config.puckScaleByZoom[12], 666);
        assert.equal(
            config.puckScaleByZoom[13],
            NAVIGATION_TUNING.base.puckScaleByZoom[13],
        );
        assert.equal(config.zoomBySpeedMph[40], 15);
        assert.equal(resolveNavigationTuning().puckScaleByZoom[12], 555);
        assert.equal(
            resolveNavigationTuning({ platform: 'ios' }).puckScaleByZoom[12],
            NAVIGATION_TUNING.base.puckScaleByZoom[12],
        );
        const controller = createFollowSpeedZoomController();
        assert.equal(controller.update({ speed: mph(40), force: true }), 15);
        assert.equal(controller.update({ speed: mph(44.99), force: true }), 15);
        assert.equal(controller.update({ speed: mph(45), force: true }), 16);
    } finally {
        delete phone.puckScaleByZoom;
        delete phone.zoomBySpeedMph;
        delete phone.modes['north-up'];
    }
});

test('no-route automotive overview inherits the baseline and discrete speed zoom', () => {
    const options = {
        platform: 'android',
        surface: 'automotive',
        mode: 'north-up',
    };
    const expression = JSON.parse(getNavigationPuck3DScaleExpression(options));
    assert.deepEqual(expression.slice(0, 5), [
        'interpolate',
        ['linear'],
        ['zoom'],
        9,
        ['literal', [8192, 8192, 8192]],
    ]);
    const controller = createFollowSpeedZoomController(options);
    const offset = resolveNavigationTuning(options).zoomOffset;
    assert.equal(
        controller.update({ speed: mph(30), force: true }) + offset,
        18.25,
    );
    assert.equal(
        controller.update({ speed: mph(34.9), force: true }) + offset,
        18.25,
    );
    assert.equal(
        controller.update({ speed: mph(35), force: true }) + offset,
        17.5,
    );
});

test('clusters always use perspective tuning even if an overview mode is supplied', () => {
    for (const platform of ['android', 'ios']) {
        for (const mode of ['north-up', 'route-overview']) {
            assert.deepEqual(
                resolveNavigationTuning({ platform, surface: 'cluster', mode }),
                resolveNavigationTuning({ platform, surface: 'cluster' }),
            );
        }
    }
});
