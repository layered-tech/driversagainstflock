import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

test('a closed removal sheet can open, cancel, reopen, and close', () => {
    const harness = createHookHarness();
    const calls = [];
    const modal = {
        dismiss: () => calls.push('dismiss'),
        present: () => calls.push('present'),
    };
    const { RemoveCameraSheet } = loadTourModule(
        new URL('../../edits/remove-camera-sheet.js', import.meta.url),
        {
            '@gorhom/bottom-sheet': { BottomSheetBackdrop: 'Backdrop' },
            react: harness.react,
            'react-native': {
                Text: 'Text',
                View: 'View',
                useWindowDimensions: () => ({ height: 900 }),
            },
            '../../lib/auth': { useAuth: () => ({ user: { name: 'mapper' } }) },
            '../../lib/osm/client': { publishNodeDeletion: async () => {} },
            '../../lib/osm/edit-tags': {
                buildRemovalChangesetComment: () => 'Removed camera',
                REMOVAL_REASONS: [{ value: 'gone', label: 'Gone' }],
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ bottom: 0 }),
            },
            '../contribute/contribute-state': {
                useContribute: () => ({ stageRemoval: async () => {} }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': {
                DafButton: 'Button',
                DafChip: 'Chip',
                DafSectionLabel: 'SectionLabel',
            },
            '../design-system/tokens': {
                dafColors: { amber: { 600: '#fff' } },
            },
            '../map/native-components': {
                NativeWindBottomSheetModal: 'Modal',
                NativeWindBottomSheetView: 'SheetView',
            },
        },
    );
    const render = (isOpen) =>
        harness.render(() => {
            const sheet = RemoveCameraSheet({
                isOpen,
                node: { id: 123, latitude: 30, longitude: -97 },
            });
            sheet.props.ref.current = modal;
            return sheet;
        });

    render(false);
    assert.deepEqual(
        calls,
        [],
        'Do not dismiss a modal before its first presentation',
    );
    const sheet = render(true);
    assert.deepEqual(calls, ['present']);

    sheet.props.onDismiss();
    render(false);
    assert.deepEqual(
        calls,
        ['present'],
        'Native dismissal already closed the modal',
    );

    render(true);
    render(false);
    assert.deepEqual(calls, ['present', 'present', 'dismiss']);
    harness.cleanup();
});
