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
    for (const hasActiveNavigation of [false, true]) {
        test(`${platform} orders map controls and refreshes recenter while ${hasActiveNavigation ? 'navigating' : 'browsing'}`, () => {
            let refreshes = 0;
            let recenterPresses = 0;
            let zoomInPresses = 0;
            let zoomOutPresses = 0;
            const context = vm.createContext({
                DRIVING_MAP_VIEW_PERSPECTIVE: 'perspective',
                ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS: {
                    trackingState: 'inactive',
                },
                activeNavigationRoute: hasActiveNavigation ? {} : null,
                autoPlayPlatform: {
                    usesDrivingMapViewButtonForDebugging:
                        platform === 'android',
                },
                getAutoPlayMapButtonAppearanceKey,
                getAutoPlayMapControlHandlers: () => ({
                    handleLocationTrackingPress: () => recenterPresses++,
                    handleZoomInPress: () => zoomInPresses++,
                    handleZoomOutPress: () => zoomOutPresses++,
                }),
                getRootHeaderDrivingMapViewButtonImage: () => 'view',
                getRootMapPanButtonImage: () => 'pan',
                getRootMapZoomInButtonImage: () => 'zoom-in',
                getRootMapZoomOutButtonImage: () => 'zoom-out',
                getRootMapTrackingButtonImage: () => 'recenter',
                handleRootHeaderDrivingMapViewPress() {},
                loadAutoPlayModule: () => ({ Flag: { Persistent: 2 } }),
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
                const recenterImages =
                    trackingState === 'active' ? [] : ['recenter'];
                assert.deepEqual(
                    Array.from(buttons, (button) => button.image),
                    platform === 'android'
                        ? ['zoom-in', 'zoom-out', 'view', ...recenterImages]
                        : ['pan', 'zoom-in', 'zoom-out', ...recenterImages],
                );
                for (const button of buttons) {
                    assert.equal(
                        button.flags,
                        button.image.startsWith('zoom-') ? undefined : 2,
                    );
                }
                if (platform === 'android') {
                    // Keep the persistent controls together after the zoom controls.
                    const persistentButtons = buttons.filter(
                        (button) => button.flags === 2,
                    );
                    assert.deepEqual(
                        Array.from(persistentButtons, (button) => button.image),
                        ['view', ...recenterImages],
                    );
                    persistentButtons.forEach((button, index) =>
                        assert.strictEqual(
                            button,
                            buttons[
                                buttons.length -
                                    persistentButtons.length +
                                    index
                            ],
                        ),
                    );
                }
                buttons.find((button) => button.image === 'zoom-in').onPress();
                buttons.find((button) => button.image === 'zoom-out').onPress();
                assert.equal(zoomInPresses, zoomOutPresses);
                assert.ok(zoomInPresses > 0);
                assert.strictEqual(getButtons(), buttons);
                update(trackingState);
                assert.equal(refreshes, previousRefreshes + 1);
                if (trackingState === 'recenter') {
                    buttons
                        .find((button) => button.image === 'recenter')
                        .onPress();
                    assert.equal(recenterPresses, 1);
                }
            }
        });
    }
}
