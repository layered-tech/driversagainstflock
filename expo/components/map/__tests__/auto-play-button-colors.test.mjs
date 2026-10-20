import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function sourceBetween(startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}

function createHarness(platform, isDarkMapLayer) {
    const adapter = readFileSync(
        new URL(`../../auto-play-platform.${platform}.js`, import.meta.url),
        'utf8',
    );
    const context = vm.createContext({
        AndroidAutoMapSurface() {},
        CarPlayMapSurface() {},
        DRIVING_MAP_VIEW_PERSPECTIVE: 'perspective',
        DRIVING_MAP_VIEW_ROUTE_OVERVIEW: 'overview',
        activeNavigationRoute: null,
        rootMapButtonAppearance: {
            isDarkMapLayer,
            trackingState: 'inactive',
            compassNorthDirection: 0,
            drivingMapViewMode: 'perspective',
        },
        getAutoPlayCompassNeedleImage: () => 'compass-asset',
    });
    vm.runInContext(
        adapter
            .slice(adapter.indexOf('export const autoPlayPlatform'))
            .replace('export const', 'const'),
        context,
    );
    vm.runInContext(
        sourceBetween('const AUTO_PLAY_GLYPH_COLOR', 'let autoPlayModule;') +
            sourceBetween(
                'function getRootMapPanButtonImage()',
                'function setAutoPlayDrivingModeIsActive(',
            ) +
            sourceBetween(
                'const ROOT_HEADER_SEARCH_IMAGE',
                'function makeRootHeaderPrimaryLocationButton(',
            ),
        context,
    );
    return (expression) =>
        JSON.parse(JSON.stringify(vm.runInContext(expression, context)));
}

for (const isDarkMapLayer of [false, true]) {
    const mode = isDarkMapLayer ? 'dark' : 'light';

    test(`Android Auto requests host tint for toolbar and map icons on a ${mode} map`, () => {
        const evaluate = createHarness('android', isDarkMapLayer);
        const toolbarIcons = evaluate(`[
            ROOT_HEADER_SEARCH_IMAGE,
            ROOT_HEADER_ROUTE_STEPS_IMAGE,
            ROOT_HEADER_MAP_OPTIONS_IMAGE,
            ...Object.values(ROOT_HEADER_PRIMARY_LOCATION_IMAGES),
        ]`);
        for (const image of toolbarIcons) {
            assert.equal(image.color, 'default', image.name);
            assert.equal(image.backgroundColor, 'transparent', image.name);
        }
        for (const factory of [
            'getRootMapPanButtonImage',
            'getRootMapZoomInButtonImage',
            'getRootMapZoomOutButtonImage',
            'getRootMapTrackingButtonImage',
            'getRootHeaderDrivingMapViewButtonImage',
        ]) {
            assert.equal(evaluate(`${factory}()`).color, 'default', factory);
        }
    });

    test(`CarPlay requests host colors for all button states on a ${mode} map`, () => {
        const evaluate = createHarness('ios', isDarkMapLayer);
        const headerIcons = evaluate(`[
            ROOT_HEADER_SEARCH_IMAGE,
            ROOT_HEADER_ROUTE_STEPS_IMAGE,
            ROOT_HEADER_MAP_OPTIONS_IMAGE,
            ...Object.values(ROOT_HEADER_PRIMARY_LOCATION_IMAGES),
            makeButtonGlyphImage('location'),
        ]`);
        for (const image of headerIcons) {
            assert.equal(image.color, 'default', image.name);
            assert.equal(image.backgroundColor, 'transparent', image.name);
        }
        for (const trackingState of ['inactive', 'active', 'recenter']) {
            evaluate(
                `rootMapButtonAppearance.trackingState = '${trackingState}'`,
            );
            for (const factory of [
                'getRootMapPanButtonImage',
                'getRootMapZoomInButtonImage',
                'getRootMapZoomOutButtonImage',
                'getRootMapTrackingButtonImage',
                'getRootHeaderDrivingMapViewButtonImage',
                'getRootHeaderExitNavigationButtonImage',
            ]) {
                const image = evaluate(`${factory}()`);
                assert.equal(image.color, 'default', factory);
                assert.equal(image.backgroundColor, 'transparent', factory);
            }
        }
        evaluate('activeNavigationRoute = {}');
        evaluate("rootMapButtonAppearance.drivingMapViewMode = 'overview'");
        assert.equal(
            evaluate('getRootHeaderDrivingMapViewButtonImage().color'),
            'default',
        );
        assert.equal(
            evaluate(
                'getRootHeaderDrivingMapViewButtonImage().backgroundColor',
            ),
            'transparent',
        );
    });

    for (const platform of ['android']) {
        test(`${platform} retains blue active controls and red exit icons on a ${mode} map`, () => {
            const evaluate = createHarness(platform, isDarkMapLayer);
            evaluate("rootMapButtonAppearance.trackingState = 'active'");
            assert.equal(
                evaluate('getRootMapTrackingButtonImage().color'),
                '#2563eb',
            );
            evaluate('activeNavigationRoute = {}');
            evaluate("rootMapButtonAppearance.drivingMapViewMode = 'overview'");
            assert.equal(
                evaluate('getRootHeaderDrivingMapViewButtonImage().color'),
                '#2563eb',
            );
            assert.deepEqual(
                evaluate('getRootHeaderExitNavigationButtonImage().color'),
                { darkColor: '#fca5a5', lightColor: '#b91c1c' },
            );
        });
    }
}

test('CarPlay keeps the header and map buttons visible', () => {
    const evaluate = createHarness('ios', false);
    assert.deepEqual(
        evaluate('autoPlayPlatform.getMapTemplatePlatformConfig()'),
        {
            automaticallyHidesNavigationBar: false,
            hidesButtonsWithNavigationBar: false,
        },
    );
});
