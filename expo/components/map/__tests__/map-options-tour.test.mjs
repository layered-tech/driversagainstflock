import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAP_OPTIONS_TOUR } from '../map-options-tour.js';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

function elements(node, predicate) {
    if (!node || typeof node !== 'object') {
        return [];
    }

    if (Array.isArray(node)) {
        return node.flatMap((child) => elements(child, predicate));
    }

    const children =
        typeof node.type === 'function'
            ? node.type(node.props)
            : node.props?.children;

    return [
        ...(predicate(node) ? [node] : []),
        ...elements(children, predicate),
    ];
}

function createMapSheetHarness({ progress = { status: 'pending' } } = {}) {
    const hooks = createHookHarness();
    const changes = [];
    const tour = { progress, start: () => changes.push('start-tour') };
    const context = {
        currentMapBounds: [
            [-97.8, 30.3],
            [-97.7, 30.2],
        ],
        handleMapLayerSheetChange: (index) => changes.push(['sheet', index]),
        handleMapLayerSheetDismiss: () => changes.push('dismiss-sheet'),
        handleMapLayerSelect: (value) => changes.push(['layer', value]),
        insets: { top: 20, bottom: 10, left: 0, right: 0 },
        layerSheetRef: { current: null },
        mapPreferencesAreLoaded: true,
        mapStyleURL: 'standard',
        selectedMapLayer: { key: 'standard', label: 'Standard' },
        policeAlertsVisible: false,
        cameraConesVisible: true,
        markerClustersEnabled: true,
        surveillanceMarkersVisible: true,
        mapLightPresetPreference: 'auto',
        mapTrafficEnabled: false,
        preferPrivateRoutes: false,
    };

    for (const name of [
        'setCameraConesVisible',
        'setMarkerClustersEnabled',
        'setMapLightPresetPreference',
        'setMapTrafficEnabled',
        'setPoliceAlertsVisible',
        'setPreferPrivateRoutes',
        'setSurveillanceMarkersVisible',
    ]) {
        context[name] = (value) => changes.push([name, value]);
    }

    const { MapLayerSheet } = loadTourModule(
        new URL('../map-layer-controls.js', import.meta.url),
        {
            react: hooks.react,
            'react-native': {
                Pressable: 'Pressable',
                Switch: 'Switch',
                Text: 'Text',
                View: 'View',
                useWindowDimensions: () => ({ width: 390, height: 844 }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': {
                DafButton: 'DafButton',
                DafChip: 'DafChip',
                DafSectionLabel: 'DafSectionLabel',
            },
            '../tour-overlay': { TourOverlay: 'TourOverlay' },
            '../tour-target': { TourTarget: 'TourTarget' },
            '../user-tours': {
                useUserTour: (id) => {
                    assert.equal(id, MAP_OPTIONS_TOUR.id);
                    return tour;
                },
            },
            './constants': {
                MAP_LAYER_STYLES: [context.selectedMapLayer],
                MAP_LIGHT_PRESET_OPTIONS: [
                    { key: 'auto', label: 'Auto' },
                    { key: 'night', label: 'Night' },
                ],
            },
            './map-control-button': { MapControlButton: 'MapControlButton' },
            './map-layer-preview': {
                MapLayerPreview: 'MapLayerPreview',
                MapLayersIcon: 'MapLayersIcon',
            },
            './map-options-tour': { MAP_OPTIONS_TOUR },
            './map-screen-context': { useMapLayerContext: () => context },
            './native-components': {
                NativeWindBottomSheetModal: 'BottomSheetModal',
                NativeWindBottomSheetScrollView: 'BottomSheetScrollView',
            },
            './offline-map-controls': {
                OfflineMapControls: 'OfflineMapControls',
            },
            './weather-runtime': {
                useWeatherState: () => ({ preferences: { enabled: true } }),
                weatherStore: { setEnabled: () => changes.push('weather') },
            },
        },
    );

    return {
        changes,
        context,
        tour,
        render: () => hooks.render(MapLayerSheet),
    };
}

describe('Map options first-visit tour', () => {
    test('starts only when the real sheet opens and disables its overlay when dismissed', () => {
        const harness = createMapSheetHarness();
        let sheet = harness.render();
        let overlay = elements(sheet, (node) => node.type === 'TourOverlay')[0];

        assert.equal(overlay.props.enabled, false);
        assert.deepEqual(harness.changes, []);

        sheet.props.onChange(0);
        sheet = harness.render();
        overlay = elements(sheet, (node) => node.type === 'TourOverlay')[0];
        assert.equal(overlay.props.enabled, true);
        assert.deepEqual(harness.changes, [['sheet', 0], 'start-tour']);

        sheet.props.onDismiss();
        overlay = elements(
            harness.render(),
            (node) => node.type === 'TourOverlay',
        )[0];
        assert.equal(overlay.props.enabled, false);
        assert.equal(harness.changes.at(-1), 'dismiss-sheet');
    });

    test('waits for stored progress before starting and leaves completed or skipped tours alone', () => {
        const harness = createMapSheetHarness({ progress: null });
        harness.render().props.onChange(0);
        harness.render();
        assert.deepEqual(harness.changes, [['sheet', 0]]);

        harness.tour.progress = { status: 'pending' };
        harness.render();
        assert.equal(harness.changes.at(-1), 'start-tour');

        for (const status of ['active', 'completed', 'skipped']) {
            harness.tour.progress = { status };
            harness.render();
        }

        assert.equal(
            harness.changes.filter((change) => change === 'start-tour').length,
            1,
        );
    });

    test('anchors each lesson to its real control and does not alter map preferences', () => {
        const harness = createMapSheetHarness();
        harness.render().props.onChange(0);
        const sheet = harness.render();
        const overlay = elements(
            sheet,
            (node) => node.type === 'TourOverlay',
        )[0];
        const policeTarget = elements(
            sheet,
            (node) =>
                node.type === 'TourTarget' &&
                node.props.id === 'police-reports',
        )[0];
        const timeTarget = elements(
            sheet,
            (node) =>
                node.type === 'TourTarget' && node.props.id === 'time-of-day',
        )[0];
        const offline = elements(
            sheet,
            (node) => node.type === 'OfflineMapControls',
        )[0];

        assert.deepEqual(overlay.props.steps, MAP_OPTIONS_TOUR.steps);
        assert.equal(overlay.props.targets, policeTarget.props.targets);
        assert.equal(overlay.props.targets, timeTarget.props.targets);
        assert.equal(overlay.props.targets, offline.props.tourTargets);
        assert.equal(
            overlay.props.scrollRef,
            elements(sheet, (node) => node.type === 'BottomSheetScrollView')[0]
                .props.ref,
        );
        assert.ok(overlay.props.contentRef);
        assert.equal(overlay.props.restoreScrollOnFinish, true);
        assert.equal(
            elements(
                policeTarget,
                (node) => node.props?.testID === 'map-police-alerts-toggle',
            )[0].props.value,
            false,
        );
        assert.equal(
            elements(
                timeTarget,
                (node) => node.props?.testID === 'map-light-preset-option-auto',
            )[0].props.accessibilityState.selected,
            true,
        );
        assert.deepEqual(harness.changes, [['sheet', 0], 'start-tour']);
    });

    test('retains the actual police switch and time-of-day selection handlers', () => {
        const harness = createMapSheetHarness();
        const sheet = harness.render();
        elements(
            sheet,
            (node) => node.props?.testID === 'map-police-alerts-toggle',
        )[0].props.onValueChange(true);
        elements(
            sheet,
            (node) => node.props?.testID === 'map-light-preset-option-night',
        )[0].props.onPress();

        assert.deepEqual(harness.changes, [
            ['setPoliceAlertsVisible', true],
            ['setMapLightPresetPreference', 'night'],
        ]);
    });

    test('keeps Offline Data collapsed and download operations explicit', () => {
        const hooks = createHookHarness();
        const actions = [];
        const targets = { current: {} };
        const { OfflineMapControls } = loadTourModule(
            new URL('../offline-map-controls.js', import.meta.url),
            {
                react: hooks.react,
                'react-native': {
                    Alert: { alert: () => actions.push('delete') },
                    Pressable: 'Pressable',
                    Text: 'Text',
                    View: 'View',
                },
                '../design-system/icon': { Icon: 'Icon' },
                '../tour-target': { TourTarget: 'TourTarget' },
                './offline-map-action-icon': {
                    OfflineMapActionIcon: 'OfflineMapActionIcon',
                },
                './offline-map-utils': { OFFLINE_MAX_ZOOM_OPTIONS: [12, 14] },
                './use-offline-map-pack': {
                    useOfflineMapPack: () => ({
                        selectedMaxZoom: 12,
                        statusLabel: 'Not downloaded',
                        handlePrimaryOfflineAction: () =>
                            actions.push('download'),
                    }),
                },
            },
        );
        const render = () =>
            hooks.render(() =>
                OfflineMapControls({
                    selectedMapLayer: { label: 'Standard' },
                    tourTargets: targets,
                    resetKey: 0,
                }),
            );
        let tree = render();
        assert.equal(
            elements(tree, (node) => node.type === 'TourTarget')[0].props
                .targets,
            targets,
        );
        assert.equal(
            elements(
                tree,
                (node) => node.props?.testID === 'offline-map-primary-action',
            ).length,
            0,
        );
        assert.deepEqual(actions, []);

        elements(
            tree,
            (node) => node.props?.testID === 'offline-map-section-toggle',
        )[0].props.onPress();
        tree = render();
        const action = elements(
            tree,
            (node) => node.props?.testID === 'offline-map-primary-action',
        )[0];
        assert.ok(action);
        assert.deepEqual(actions, []);
        action.props.onPress();
        assert.deepEqual(actions, ['download']);
    });
});
