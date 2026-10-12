import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';
import { saveDraftBeforeExit } from '../../contribute/contribute-draft-actions.js';
import { getChangesetSummary } from '../../contribute/changeset-summary.js';

function find(tree, id) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.props?.testID === id) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const match = find(child, id);
        if (match) return match;
    }
    return null;
}
function createOverlay(saved) {
    const hooks = createHookHarness();
    const calls = [];
    const { ContributePlacementOverlay } = loadTourModule(
        new URL(
            '../../contribute/contribute-placement-overlay.js',
            import.meta.url,
        ),
        {
            react: hooks.react,
            'react-native': {
                Alert: { alert: () => calls.push('error') },
                BackHandler: { addEventListener: () => ({ remove() {} }) },
                Pressable: 'Pressable',
                Text: 'Text',
                View: 'View',
            },
            '@gorhom/bottom-sheet': { BottomSheetBackdrop: 'Backdrop' },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': { DafButton: 'Button' },
            '../map/native-components': {
                NativeWindBottomSheetModal: 'Modal',
                NativeWindBottomSheetView: 'View',
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ bottom: 10 }),
            },
            './contribute-state': {
                useContribute: () => ({
                    pins: [{ id: 'one' }],
                    removals: [],
                    tour: {},
                    saveDraft: async () => {
                        calls.push('save');
                        return saved;
                    },
                    exitContribute: () => calls.push('exit'),
                    discardStoredDraft: async () => calls.push('discard'),
                }),
            },
            './contribute-draft-actions': { saveDraftBeforeExit },
            './contribute-tour-overlay': { ContributeTourOverlay: 'Overlay' },
            './changeset-summary': { getChangesetSummary },
        },
    );
    return {
        calls,
        render: () =>
            hooks.render(() =>
                ContributePlacementOverlay({
                    screenIsFocused: false,
                    tourTargets: { current: {} },
                }),
            ),
        cleanup: hooks.cleanup,
    };
}

test('Keep as draft exits only after the actual draft write succeeds', async () => {
    const overlay = createOverlay(true);
    try {
        await find(overlay.render(), 'contribute-keep-draft').props.onPress();
        assert.deepEqual(overlay.calls, ['save', 'exit']);
    } finally {
        overlay.cleanup();
    }
});

test('a failed draft save keeps the editor open and shows an error', async () => {
    const overlay = createOverlay(false);
    try {
        await find(overlay.render(), 'contribute-keep-draft').props.onPress();
        assert.deepEqual(overlay.calls, ['save', 'error']);
    } finally {
        overlay.cleanup();
    }
});
