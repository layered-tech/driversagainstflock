import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

function find(tree, id) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.props?.testID === id) return tree;
    return [tree.props?.children]
        .flat(Infinity)
        .map((child) => find(child, id))
        .find(Boolean);
}
function createEntry(railEdge = null) {
    const hooks = createHookHarness();
    const actions = [];
    const contribution = {
        coachMarkIsDismissed: true,
        contributeStatus: 'idle',
        storedDraftSummary: {
            updatedAt: 'now',
            pinCount: 3,
            label: '2 added · 1 deleted',
        },
        dismissCoachMark: () => actions.push('dismiss'),
        resumeStoredDraft: () => actions.push('resume'),
        openStartSheet: () => actions.push('start'),
    };
    const { ContributeEntryButton } = loadTourModule(
        new URL('../../contribute/contribute-entry-button.js', import.meta.url),
        {
            react: hooks.react,
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeNavigationAction',
                NativeModalContent: 'NativeModalContent',
                useDuoRailEdge: () => railEdge,
            },
            'react-native': {
                View: 'View',
                Text: 'Text',
                Pressable: 'Pressable',
            },
            '../design-system/tokens': {
                dafSemanticColors: { brand: 'green' },
            },
            '../map/constants': {
                MAP_CONTROL_BUTTON_CLASS_NAME: 'control',
                MAP_CONTROL_BUTTON_SIZE: 48,
            },
            '../map/map-control-button': { MapControlButton: 'Button' },
            '../map/map-control-icon': { MapControlIcon: 'Icon' },
            '../map/shared-map-state': {
                useSharedMapState: () => ({ drivingModeIsActive: false }),
            },
            './contribute-state': { useContribute: () => contribution },
        },
    );
    return {
        actions,
        contribution,
        render: (dark = false) =>
            hooks.render(() => ContributeEntryButton({ isDarkMapLayer: dark })),
        cleanup: hooks.cleanup,
    };
}

test('the draft tip dismisses without resuming; only the pencil resumes', () => {
    const entry = createEntry();
    try {
        find(entry.render(), 'contribute-coach-mark').props.onPress();
        assert.deepEqual(entry.actions, ['dismiss']);
        assert.equal(find(entry.render(), 'contribute-coach-mark'), undefined);
        assert.ok(find(entry.render(), 'contribute-draft-count'));
        assert.equal(
            find(entry.render(), 'map-contribute-button').props
                .accessibilityLabel,
            'Resume draft changeset, 3 pending changes',
        );
        find(entry.render(), 'map-contribute-button').props.onPress();
        assert.deepEqual(entry.actions, ['dismiss', 'resume']);
    } finally {
        entry.cleanup();
    }
});

test('pencil surface, glass, and enlarged badge follow map appearance independently of system theme', () => {
    const entry = createEntry();
    try {
        let tree = entry.render(true);
        assert.match(
            find(tree, 'map-contribute-button').props.className,
            /bg-daf-surface-dark/,
        );
        assert.equal(
            find(tree, 'map-contribute-button').props.glassColorScheme,
            'dark',
        );
        assert.match(
            find(tree, 'contribute-draft-count').props.className,
            /h-7 min-w-7/,
        );
        tree = entry.render(false);
        assert.match(
            find(tree, 'map-contribute-button').props.className,
            /bg-white/,
        );
        assert.equal(
            find(tree, 'map-contribute-button').props.glassColorScheme,
            'light',
        );
        assert.doesNotMatch(
            find(tree, 'map-contribute-button').props.className,
            /dark:/,
        );
    } finally {
        entry.cleanup();
    }
});

test('liquid glass receives the map theme and contribution border', () => {
    const { MapControlButton } = loadTourModule(
        new URL('../map-control-button.js', import.meta.url),
        {
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeNavigationAction',
                NativeModalContent: 'NativeModalContent',
            },
            'react-native': { Pressable: 'Pressable' },
            './constants': { MAP_CONTROL_BUTTON_SIZE: 48 },
            './duo-rail-icons': { getDuoRailIcon: () => undefined },
            './map-liquid-glass': { mapLiquidGlassIsAvailable: () => true },
            './native-components': { NativeWindGlassView: 'Glass' },
        },
    );
    const tree = MapControlButton({
        glassColorScheme: 'dark',
        glassBorderClassName: 'border-daf-brand',
        glassTintColor: 'black',
    }).props.children;
    assert.doesNotMatch(tree.props.className, /shadow-/);
    assert.equal(tree.props.colorScheme, 'dark');
    assert.equal(tree.props.tintColor, 'black');
    assert.match(tree.props.className, /border-daf-brand/);
    assert.equal(tree.props.children.props.glassColorScheme, undefined);
});

test('Duo keeps the draft count on the native pencil without an orphan custom badge', () => {
    const entry = createEntry('trailing');
    try {
        const tree = entry.render();
        assert.equal(find(tree, 'map-contribute-button').props.nativeBadge, 3);
        assert.equal(find(tree, 'contribute-draft-count'), undefined);
        assert.match(
            find(tree, 'contribute-coach-mark').props.className,
            /right-0/,
        );
        assert.equal(find(tree, 'contribute-coach-mark').props.style.top, 0);
    } finally {
        entry.cleanup();
    }
});
