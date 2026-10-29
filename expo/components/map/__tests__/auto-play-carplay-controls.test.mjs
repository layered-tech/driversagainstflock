import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const extract = (start, end) =>
    source.slice(
        source.indexOf(start),
        source.indexOf(end, source.indexOf(start)),
    );

test('CarPlay swaps standard Pan/Recenter controls for exactly two zoom controls during panning', () => {
    const updates = [];
    const presses = [];
    const context = vm.createContext({
        autoPlaySearchWorkflowIsActive: false,
        routePreviewIsVisible: false,
        autoPlayPlatform: { usesPanZoomControlsOnly: true },
        activeNavigationRoute: {},
        DRIVING_MAP_VIEW_PERSPECTIVE: 'perspective',
        DRIVING_MAP_VIEW_ROUTE_OVERVIEW: 'route-overview',
        rootMapButtonAppearance: { trackingState: 'recenter' },
        rootMapButtonAppearanceKey: 'recenter',
        rootMapPanningInterfaceIsVisible: false,
        rootMapButtonsRefreshIsDeferred: false,
        rootMapHeaderActionsRefreshIsDeferred: false,
        navigationGuidanceIsDeferredDuringPanning: false,
        deferredNavigationGuidanceLocation: null,
        lastAppliedMapButtonsKey: 'old',
        rootMapTemplate: {
            setMapButtons: (buttons) => {
                updates.push(buttons);
                return Promise.resolve();
            },
        },
        loadAutoPlayModule: () => ({ Flag: { Persistent: 2 } }),
        getRootMapPanButtonImage: () => 'pan',
        getRootMapZoomInButtonImage: () => 'zoom-in',
        getRootMapZoomOutButtonImage: () => 'zoom-out',
        getRootMapTrackingButtonImage: () => 'recenter',
        getAutoPlayMapControlHandlers: () => ({
            handleZoomInPress: () => presses.push('in'),
            handleZoomOutPress: () => presses.push('out'),
        }),
        scheduleTemplateUpdate: () => updates.push(context.getRootMapButtons()),
    });
    vm.runInContext(
        [
            extract(
                'function handleRootMapPanningInterfaceChanged(',
                'function getAutoPlayDrivingModeIsActive(',
            ),
            extract(
                'const handleRootZoomInPress =',
                'let lastDeferredSharedNavigationStartKey',
            ),
        ].join('\n'),
        context,
    );
    const images = (buttons) => Array.from(buttons, ({ image }) => image);
    assert.deepEqual(images(context.getRootMapButtons()), ['pan', 'recenter']);
    context.handleRootMapPanningInterfaceChanged(true);
    assert.deepEqual(images(updates.at(-1)), ['zoom-in', 'zoom-out']);
    updates.at(-1).forEach(({ onPress }) => onPress());
    assert.deepEqual(presses, ['in', 'out']);
    context.handleRootMapPanningInterfaceChanged(false);
    assert.deepEqual(images(updates.at(-1)), ['pan', 'recenter']);
    assert.equal(context.lastAppliedMapButtonsKey, null);
    context.autoPlaySearchWorkflowIsActive = true;
    assert.deepEqual(images(context.getRootMapButtons()), ['recenter']);
    context.autoPlaySearchWorkflowIsActive = false;
    assert.deepEqual(images(context.getRootMapButtons()), ['pan', 'recenter']);
    context.routePreviewIsVisible = true;
    assert.deepEqual(images(context.getRootMapButtons()), ['recenter']);
    context.routePreviewIsVisible = false;
    assert.deepEqual(images(context.getRootMapButtons()), ['pan', 'recenter']);
    context.rootMapButtonAppearance.drivingMapViewMode = 'route-overview';
    assert.deepEqual(images(context.getRootMapButtons()), []);
    context.rootMapButtonAppearance.drivingMapViewMode = 'perspective';
    assert.deepEqual(images(context.getRootMapButtons()), ['pan', 'recenter']);
});

test('CarPlay hides only the header during navigation and restores idle visibility after stopping', () => {
    const modes = [];
    const context = vm.createContext({
        autoPlayPlatform: { autoHidesNavigationHeader: true },
        rootMapTemplate: {
            setHideControls: (mode) => {
                modes.push(mode);
                return Promise.resolve();
            },
        },
        rootMapTemplateIsReady: true,
        rootMapPanningInterfaceIsVisible: false,
        activeNavigationRoute: null,
        scheduleTemplateUpdate() {},
    });
    vm.runInContext(
        extract(
            'function updateRootTemplateHeaderActions(',
            'function updateRootMapButtons(',
        ),
        context,
    );
    context.updateRootTemplateHeaderActions();
    context.activeNavigationRoute = {};
    context.updateRootTemplateHeaderActions();
    context.activeNavigationRoute = null;
    context.updateRootTemplateHeaderActions();
    assert.deepEqual(modes, ['none', 'header', 'none']);
});

test('both CarPlay map configurations suppress the Mapbox compass in every navigation state', () => {
    for (const file of [
        'carplay-map-surface.js',
        'auto-play-cluster-state.js',
    ]) {
        const config = readFileSync(
            new URL(`../../${file}`, import.meta.url),
            'utf8',
        );
        assert.match(config, /hideMapboxCompass: true/);
    }
});
