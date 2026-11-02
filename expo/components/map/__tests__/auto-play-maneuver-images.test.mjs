import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { getManeuverKind } from '../maneuver-kind.js';
import { getAutoPlayManeuverConfig } from '../../auto-play-maneuver-config.js';

const components = new URL('../../', import.meta.url);
const source = readFileSync(new URL('auto-play.js', components), 'utf8');
const context = vm.createContext({ getManeuverKind });

for (const file of [
    'auto-play-maneuver-images.generated.js',
    'auto-play-roundabout-exit-images.js',
    'auto-play-maneuver-images.js',
]) {
    context.require = (path) => {
        const asset = new URL(path, components);
        assert.equal(readFileSync(asset).subarray(1, 4).toString(), 'PNG');
        return asset.pathname;
    };
    vm.runInContext(
        readFileSync(new URL(file, components), 'utf8')
            .replace(/^import .*;\n/gm, '')
            .replaceAll('export ', ''),
        context,
    );
}

function makeManeuver(platform, maneuver) {
    const adapter = readFileSync(
        new URL(`auto-play-platform.${platform}.js`, components),
        'utf8',
    );
    const scope = {
        ...context,
        getAutoPlayManeuverImage: vm.runInContext(
            'getAutoPlayManeuverImage',
            context,
        ),
        getAutoPlayRoundaboutExitImage: vm.runInContext(
            'getAutoPlayRoundaboutExitImage',
            context,
        ),
        getAutoPlayManeuverConfig,
        AndroidAutoMapSurface() {},
        CarPlayMapSurface() {},
        getSelectedDirectionsRouteOption: () => ({ routeKey: 'route' }),
        getManeuverInstruction: (value) => value.instruction,
        getManeuverDistanceRemaining: () => 100,
        getManeuverDurationSeconds: () => 10,
        getManeuverNumber: Number,
        getManeuverCardBackgroundColor: () => '#111827',
        getManeuverCardIconColor: () => '#ffffff',
        makeTravelEstimates: () => ({}),
        makeGlyphImage: (name, options) => ({
            type: 'glyph',
            name,
            ...options,
        }),
        rootMapButtonAppearance: { isDarkMapLayer: true },
    };
    const factory = source.match(
        /^function makeAutoPlayRoutingManeuver\([^]*?^}/m,
    )[0];
    return new Function(
        'scope',
        'maneuver',
        `with (scope) {
        ${adapter.slice(adapter.indexOf('export const autoPlayPlatform')).replace('export const', 'const')}
        ${factory}
        return makeAutoPlayRoutingManeuver({}, maneuver);
    }`,
    )(scope, maneuver);
}

for (const [type, kind] of [
    'left',
    'right',
    'sharp-left',
    'sharp-right',
    'slight-left',
    'slight-right',
    'straight',
    'roundabout',
    'roundabout',
    'uturn',
    'arrive',
    'depart',
    'keep-left',
    'keep-right',
].entries()) {
    for (const platform of ['android', 'ios']) {
        test(`${platform} sends the ${kind} asset for maneuver type ${type}`, () => {
            const result = makeManeuver(platform, {
                type,
                instruction: 'Continue',
            });
            assert.equal(result.symbolImage.type, 'asset');
            assert.ok(
                result.symbolImage.image.endsWith(`/maneuvers/${kind}.png`),
            );
            assert.equal(result.symbolImage.color, '#ffffff');
            assert.equal(
                result.maneuverType,
                getAutoPlayManeuverConfig({ type }).maneuverType,
            );
        });
    }
}

test('Android Auto retains numbered roundabouts and falls back for unknown maneuvers', () => {
    for (const type of [7, 8]) {
        const result = makeManeuver('android', { type, exit_number: 2 });
        assert.ok(result.symbolImage.image.endsWith('/roundabout-exit-2.png'));
        assert.equal(result.exitNumber, 2);
    }
    assert.ok(
        makeManeuver('android', { type: 99 }).symbolImage.image.endsWith(
            '/straight.png',
        ),
    );
    assert.ok(
        makeManeuver('android', {
            type: 7,
            exit_number: 20,
        }).symbolImage.image.endsWith('/maneuvers/roundabout.png'),
    );
});

test('CarPlay uses maneuver assets and retains numbered roundabouts', () => {
    assert.equal(makeManeuver('ios', { type: 0 }).symbolImage.type, 'asset');
    assert.ok(
        makeManeuver('ios', {
            type: 7,
            exit_number: 2,
        }).symbolImage.image.endsWith('/roundabout-exit-2.png'),
    );
});
