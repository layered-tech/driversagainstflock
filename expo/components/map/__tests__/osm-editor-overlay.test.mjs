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
function createOverlay(saved, tablet = false, pins = [{ id: 'one' }]) {
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
                Platform: { isPad: tablet },
                Pressable: 'Pressable',
                Text: 'Text',
                View: 'View',
                useWindowDimensions: () => ({
                    width: tablet ? 1194 : 390,
                    height: 844,
                }),
            },
            '@gorhom/bottom-sheet': { BottomSheetBackdrop: 'Backdrop' },
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeNavigationAction',
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': { DafButton: 'Button' },
            '../map/native-components': {
                NativeWindBottomSheetModal: 'Modal',
                NativeWindBottomSheetView: 'View',
                NativeWindBottomSheetScrollView: 'ScrollView',
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({
                    top: 24,
                    bottom: 10,
                    left: 0,
                    right: 0,
                }),
            },
            './contribute-state': {
                useContribute: () => ({
                    pins,
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

test('tablet editing header leaves the staged changes pane accessible', () => {
    const staged = createOverlay(true, true);
    const empty = createOverlay(true, true, []);
    try {
        const stagedStyle = staged.render().props.style;
        assert.equal(stagedStyle.marginLeft, 430);
        assert.equal(stagedStyle.width, 740);
        assert.equal(empty.render().props.style.width, 406);
        assert.ok(find(staged.render(), 'contribute-back-button'));
    } finally {
        staged.cleanup();
        empty.cleanup();
    }
});

test('close-editor confirmation opts into tablet confirmation geometry', () => {
    const overlay = createOverlay(true, true);
    try {
        const tree = overlay.render();
        const modal = tree.props.children.find(
            (child) => child?.type === 'Modal',
        );
        assert.equal(modal.props.tabletPresentation, 'confirmation');
        assert.equal(modal.props.backdropComponent({}).props.opacity, 0.28);
    } finally {
        overlay.cleanup();
    }
});
