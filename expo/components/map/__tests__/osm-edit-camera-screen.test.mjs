import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';
import {
    getCameraDetailsFromTags,
    getPresetTags,
} from '../../../lib/osm/camera-presets.js';

function find(tree, type) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.type === type) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const match = find(child, type);
        if (match) return match;
    }
    return null;
}

function createScreen() {
    const hooks = createHookHarness();
    const contribution = { pins: [], continueOnMap() {}, stageNodeEdit() {} };
    const node = {
        id: 123,
        version: 3,
        latitude: 30,
        longitude: -97,
        tags: { man_made: 'surveillance', operator: 'Original operator' },
    };
    let focus;
    contribution.getEditingNode = () => node;
    const Screen = loadTourModule(
        new URL('../../edits/edit-camera-screen.js', import.meta.url),
        {
            react: hooks.react,
            'react-native': { Text: 'Text', View: 'View' },
            'expo-router': {
                router: { back() {}, navigate() {} },
                useLocalSearchParams: () => ({ nodeId: '123' }),
                useFocusEffect: (callback) => {
                    focus = callback;
                },
            },
            '../../lib/osm/camera-presets': { getCameraDetailsFromTags },
            '../contribute/camera-form': { CameraForm: 'CameraForm' },
            '../contribute/contribute-state': {
                useContribute: () => contribution,
            },
            '../contribute/step-header': { ContributePageHeader: 'Header' },
            '../design-system/primitives': { DafButton: 'Button' },
            './remove-camera-sheet': { RemoveCameraSheet: 'RemoveSheet' },
        },
    ).default;
    const render = () => hooks.render(() => Screen());
    return {
        render,
        contribution,
        focus: () => focus(),
        node,
        cleanup: hooks.cleanup,
        async settle() {
            await Promise.resolve();
            await Promise.resolve();
            return render();
        },
    };
}

test('opening a cached camera selects its preset immediately without an OSM client', () => {
    const screen = createScreen();
    try {
        screen.node.tags = { ...getPresetTags('axon'), operator: 'City' };
        screen.render();
        screen.focus();
        const form = find(screen.render(), 'CameraForm');
        assert.equal(form.props.pin.details.preset, 'axon');
        assert.equal(form.props.pin.version, 3);
        assert.equal(form.props.pin.details.operator, 'City');
    } finally {
        screen.cleanup();
    }
});

test('a link without cached data explains how to open the camera without fetching OSM', () => {
    const screen = createScreen();
    try {
        screen.contribution.getEditingNode = () => null;
        screen.render();
        screen.focus();
        assert.match(
            JSON.stringify(screen.render()),
            /Open this camera from the map/,
        );
        assert.equal(find(screen.render(), 'CameraForm'), null);
    } finally {
        screen.cleanup();
    }
});

test('refocusing uses the latest staged tags rather than the original focus snapshot', async () => {
    const screen = createScreen();
    try {
        screen.render();
        screen.focus();
        await screen.settle();
        screen.contribution.pins = [
            {
                nodeId: 123,
                latitude: 30,
                longitude: -97,
                details: {
                    preset: 'custom',
                    rawTags: [
                        { key: 'man_made', value: 'surveillance' },
                        { key: 'operator', value: 'Staged operator' },
                    ],
                },
            },
        ];
        screen.render();
        screen.focus();
        const form = find(await screen.settle(), 'CameraForm');
        assert.equal(
            form.props.pin.details.rawTags.find((row) => row.key === 'operator')
                .value,
            'Staged operator',
        );
    } finally {
        screen.cleanup();
    }
});
