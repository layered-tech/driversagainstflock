import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

test('presentation state follows visible detents, including minimization and reopening', () => {
    const harness = createHookHarness();
    const events = [];
    const { useBottomSheetPresentedState } = loadTourModule(
        new URL('../use-bottom-sheet-presented-state.js', import.meta.url),
        { react: harness.react },
    );
    const render = () =>
        harness.render(() =>
            useBottomSheetPresentedState({
                onChange: (...args) => events.push(args),
                onDismiss: (...args) => events.push(args),
            }),
        );
    let state = render();
    assert.equal(state.bottomSheetIsPresented, false);
    state.handleBottomSheetChange(0, 400);
    state = render();
    assert.equal(state.bottomSheetIsPresented, true);
    state.handleBottomSheetChange(-1, 800);
    state = render();
    assert.equal(state.bottomSheetIsPresented, false);
    state.handleBottomSheetChange(0, 400);
    state = render();
    assert.equal(state.bottomSheetIsPresented, true);
    state.handleBottomSheetDismiss({ programmatic: true });
    assert.equal(render().bottomSheetIsPresented, false);
    assert.deepEqual(events, [
        [0, 400],
        [-1, 800],
        [0, 400],
        [{ programmatic: true }],
    ]);
});
