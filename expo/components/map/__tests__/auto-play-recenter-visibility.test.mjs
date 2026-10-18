import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { getAutoPlayMapButtonAppearanceKey } from '../../auto-play-template-state.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}

test('car recenter appears after manual zoom or releasing camera follow', () => {
    const visibilitySource = sourceBetween(
        mapSurfaceSource,
        'const isFollowing = locationTrackingMode',
        '    return {',
    );

    for (const [enabled, recenterActionIsNeeded, locationTrackingMode] of [
        [true, false, 'follow'],
        [true, true, 'follow'],
        [false, true, 'follow'],
        [false, false, 'follow'],
        [false, false, 'none'],
    ]) {
        assert.equal(
            vm.runInNewContext(
                `${visibilitySource}\ndrivingRecenterIsVisible`,
                {
                    LOCATION_TRACKING_FOLLOW: 'follow',
                    isDrivingMode: true,
                    locationTrackingMode,
                    nativeCameraFollowProps: { enabled },
                    followLocationMode: { recenterActionIsNeeded },
                },
            ),
            !enabled || recenterActionIsNeeded,
            JSON.stringify({
                enabled,
                recenterActionIsNeeded,
                locationTrackingMode,
            }),
        );
    }
});

for (const platform of ['android', 'ios']) {
    test(`${platform} shows recenter when needed and refreshes cached buttons`, () => {
        let refreshes = 0;
        let recenterPresses = 0;
        const context = vm.createContext({
            DRIVING_MAP_VIEW_PERSPECTIVE: 'perspective',
            ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS: { trackingState: 'inactive' },
            activeNavigationRoute: null,
            autoPlayPlatform: {
                usesDrivingMapViewButtonForDebugging: platform === 'ios',
            },
            getAutoPlayMapButtonAppearanceKey,
            getAutoPlayMapControlHandlers: () => ({
                handleLocationTrackingPress: () => recenterPresses++,
            }),
            getRootHeaderDrivingMapViewButtonImage: () => 'view',
            getRootMapPanButtonImage: () => 'pan',
            getRootMapZoomInButtonImage: () => 'zoom-in',
            getRootMapZoomOutButtonImage: () => 'zoom-out',
            getRootMapTrackingButtonImage: () => 'recenter',
            handleRootHeaderDrivingMapViewPress() {},
            logAutoPlayPlatformAction() {},
            rootMapButtonAppearance: { trackingState: 'inactive' },
            rootMapButtonAppearanceKey: '',
            rootMapTemplate: {},
            rootMapTemplateIsReady: true,
            updateRootMapButtons: () => refreshes++,
            updateRootTemplateHeaderActions() {},
        });
        vm.runInContext(
            sourceBetween(
                autoPlaySource,
                'function updateRootMapButtonAppearance(',
                'function handleRootMapPanningInterfaceChanged(',
            ) +
                sourceBetween(
                    autoPlaySource,
                    'const handleRootZoomInPress =',
                    'let lastDeferredSharedNavigationStartKey',
                ),
            context,
        );
        const getButtons = () =>
            vm.runInContext('getRootMapButtons()', context);
        const update = (trackingState) =>
            vm.runInContext(
                `updateRootMapButtonAppearance({ trackingState: '${trackingState}' })`,
                context,
            );
        const fixedImages = [
            platform === 'ios' ? 'view' : 'pan',
            'zoom-in',
            'zoom-out',
        ];

        for (const trackingState of [
            'inactive',
            'active',
            'recenter',
            'active',
        ]) {
            const previousRefreshes = refreshes;
            update(trackingState);
            assert.equal(refreshes, previousRefreshes + 1);
            const buttons = getButtons();
            assert.deepEqual(
                Array.from(buttons, (button) => button.image),
                trackingState === 'active'
                    ? fixedImages
                    : [...fixedImages, 'recenter'],
            );
            assert.strictEqual(getButtons(), buttons);
            update(trackingState);
            assert.equal(refreshes, previousRefreshes + 1);
            if (trackingState === 'recenter') {
                buttons.at(-1).onPress();
                assert.equal(recenterPresses, 1);
            }
        }
    });
}
