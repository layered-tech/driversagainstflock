import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

function createDetails(currentUser = { id: 1 }, closable = false) {
    const hooks = createHookHarness();
    const actions = [];
    let node = null;
    const { EditingCameraDetails } = loadTourModule(
        new URL('../../contribute/editing-camera-details.js', import.meta.url),
        {
            react: hooks.react,
            'react-native': {
                Text: 'Text',
                View: 'View',
                Pressable: 'Pressable',
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': { DafButton: 'Button' },
        },
    );
    return {
        actions,
        render: () =>
            hooks.render(() =>
                EditingCameraDetails({
                    node,
                    currentUser,
                    onEdit: () => actions.push('edit'),
                    onDelete: () => actions.push('delete'),
                    onClose: closable ? () => actions.push('close') : undefined,
                }),
            ),
        setNode: (next) => {
            node = next;
        },
        cleanup: hooks.cleanup,
    };
}

test('pane camera details retain a working close action alongside staging actions', () => {
    const details = createDetails({ id: 1 }, true);
    try {
        details.setNode({ id: 123, version: 1, tags: {} });
        find(details.render(), 'marker-details-close-button').props.onPress();
        assert.deepEqual(details.actions, ['close']);
    } finally {
        details.cleanup();
    }
});
function find(tree, id) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.props?.testID === id) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const match = find(child, id);
        if (match) return match;
    }
    return null;
}

test('existing camera details immediately show cached data and expose staging actions', async () => {
    const details = createDetails();
    try {
        details.setNode({
            id: 123,
            version: 4,
            uid: 2,
            user: 'other_mapper',
            tags: {
                man_made: 'surveillance',
                'surveillance:type': 'ALPR',
                manufacturer: 'Axon',
            },
        });
        await Promise.resolve();
        const tree = details.render();
        assert.match(JSON.stringify(tree), /Axon/);
        assert.match(JSON.stringify(tree), /other_mapper/);
        assert.match(JSON.stringify(tree), /over theirs/);
        find(tree, 'marker-details-edit-node-button').props.onPress();
        find(tree, 'marker-details-delete-node-button').props.onPress();
        assert.deepEqual(details.actions, ['edit', 'delete']);
    } finally {
        details.cleanup();
    }
});

test('changing the selected node renders its supplied tags immediately', () => {
    const details = createDetails();
    try {
        details.setNode({ id: 123, version: 1, tags: { manufacturer: 'OLD' } });
        assert.match(JSON.stringify(details.render()), /OLD/);
        details.setNode({
            id: 456,
            version: 3,
            tags: { manufacturer: 'CURRENT' },
        });
        const tree = details.render();
        assert.match(JSON.stringify(tree), /CURRENT/);
        assert.doesNotMatch(JSON.stringify(tree), /OLD/);
    } finally {
        details.cleanup();
    }
});

test('portal details identify the current mapper from parent props without requiring account context', async () => {
    const details = createDetails({ id: 17, openStreetMapId: '1' });
    try {
        details.render();
        details.setNode({
            id: 123,
            version: 2,
            uid: 1,
            user: 'current_mapper',
            tags: {},
        });
        await Promise.resolve();
        const tree = details.render();
        assert.match(JSON.stringify(tree), /you/);
        assert.doesNotMatch(JSON.stringify(tree), /over theirs/);
    } finally {
        details.cleanup();
    }
});
