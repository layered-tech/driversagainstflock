import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBottomSheetModalLifecycle } from '../bottom-sheet-modal-lifecycle.js';

function setup() {
    const frames = new Map();
    const calls = [];
    let nextFrame = 0;
    const lifecycle = createBottomSheetModalLifecycle({
        requestFrame: (callback) => {
            frames.set(++nextFrame, callback);
            return nextFrame;
        },
        cancelFrame: (id) => frames.delete(id),
        onDismiss: (...args) => calls.push(['onDismiss', ...args]),
        onChange: (...args) => calls.push(['onChange', ...args]),
        onAnimate: (...args) => calls.push(['onAnimate', ...args]),
    });
    const modal = {
        present: (...args) => calls.push(['present', ...args]),
        dismiss: (...args) => calls.push(['dismiss', ...args]),
        snapToIndex: (...args) => calls.push(['snapToIndex', ...args]),
    };
    lifecycle.setModal(modal);
    const flush = () => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback());
    };
    const count = (name) => calls.filter(([method]) => method === name).length;
    const open = () => {
        lifecycle.present();
        flush();
        lifecycle.onAnimate(-1, 0);
        lifecycle.onChange(0);
    };
    return { lifecycle, modal, calls, flush, count, open, frames };
}

test('dismiss before first presentation never reaches the native modal', () => {
    const { lifecycle, flush, count } = setup();
    lifecycle.dismiss();
    lifecycle.present();
    flush();
    assert.equal(count('dismiss'), 0);
    assert.equal(count('present'), 1);
});

test('dismiss cancels a presentation scheduled for the next frame', () => {
    const { lifecycle, flush, count } = setup();
    lifecycle.present();
    lifecycle.dismiss();
    flush();
    assert.equal(count('present'), 0);
    assert.equal(count('dismiss'), 0);
});

test('dismiss during native mounting waits for the open acknowledgement', () => {
    const { lifecycle, flush, count } = setup();
    lifecycle.present();
    flush();
    lifecycle.dismiss({ duration: 0 });
    lifecycle.onAnimate(-1, 0);
    assert.equal(count('dismiss'), 0);
    lifecycle.onChange(0);
    assert.equal(count('dismiss'), 1);
    lifecycle.onChange(0);
    lifecycle.dismiss();
    assert.equal(count('dismiss'), 1);
});

test('a new open cancels an unissued dismissal during mounting', () => {
    const { lifecycle, flush, count } = setup();
    lifecycle.present();
    flush();
    lifecycle.dismiss();
    lifecycle.present();
    lifecycle.onChange(0);
    assert.equal(count('dismiss'), 0);
    assert.equal(count('present'), 1);
});

test('reopen waits for dismissal and does not clear the new selection', () => {
    const { lifecycle, flush, count, calls, open } = setup();
    open();
    lifecycle.dismiss();
    lifecycle.present('new route');
    flush();
    assert.equal(count('present'), 1);
    lifecycle.onChange(-1);
    lifecycle.onDismiss();
    assert.equal(count('onDismiss'), 0);
    flush();
    assert.equal(count('present'), 2);
    assert.deepEqual(calls.at(-1), ['present', 'new route']);
});

test('a final dismiss cancels a queued reopen', () => {
    const { lifecycle, flush, count, calls, open } = setup();
    open();
    lifecycle.dismiss();
    lifecycle.present();
    lifecycle.dismiss();
    lifecycle.onDismiss();
    flush();
    assert.equal(count('present'), 1);
    assert.deepEqual(calls.at(-1), ['onDismiss', { programmatic: true }]);
});

test('user drag close stays closed and still reports dismissal', () => {
    const { lifecycle, flush, count, calls, open } = setup();
    open();
    lifecycle.onAnimate(0, -1);
    lifecycle.onChange(-1);
    lifecycle.onDismiss();
    flush();
    assert.equal(count('present'), 1);
    assert.deepEqual(calls.at(-1), ['onDismiss', { programmatic: false }]);
});

test('an explicit reopen during a drag waits for the old close', () => {
    const { lifecycle, flush, count, open } = setup();
    open();
    lifecycle.onAnimate(0, -1);
    lifecycle.present();
    assert.equal(count('present'), 1);
    lifecycle.onChange(-1);
    lifecycle.onDismiss();
    flush();
    assert.equal(count('present'), 2);
    assert.equal(count('onDismiss'), 0);
});

test('a minimized sheet can reopen without waiting for onDismiss', () => {
    const { lifecycle, flush, count, open } = setup();
    open();
    lifecycle.onAnimate(0, -1);
    lifecycle.present();
    lifecycle.onChange(-1);
    flush();
    flush();
    assert.equal(count('present'), 2);
});

test('presentation waits for a ref and uses the latest handle', () => {
    const { lifecycle, modal, flush, count } = setup();
    lifecycle.setModal(null);
    lifecycle.present();
    flush();
    assert.equal(count('present'), 0);
    lifecycle.setModal(modal);
    flush();
    assert.equal(count('present'), 1);
});

test('duplicate presentation and early snaps do not interrupt initial layout', () => {
    const { lifecycle, flush, count } = setup();
    lifecycle.present();
    lifecycle.present();
    flush();
    lifecycle.present();
    lifecycle.snapToIndex(0);
    assert.equal(count('present'), 1);
    assert.equal(count('snapToIndex'), 0);
    lifecycle.onChange(0);
    lifecycle.snapToIndex(0);
    assert.equal(count('snapToIndex'), 1);
});

test('unmount cancels pending frames and ignores late native events', () => {
    const { lifecycle, flush, count, frames } = setup();
    lifecycle.present();
    lifecycle.dispose();
    assert.equal(frames.size, 0);
    lifecycle.onChange(0);
    lifecycle.onDismiss();
    flush();
    assert.equal(count('present'), 0);
    assert.equal(count('onDismiss'), 0);
    assert.equal(count('onChange'), 0);
});

test('programmatic dismiss during stack minimization reaches the mounted sheet', () => {
    const { lifecycle, count, open } = setup();
    open();
    lifecycle.onAnimate(0, -1);
    lifecycle.dismiss();
    assert.equal(count('dismiss'), 1);
    lifecycle.onDismiss();
    assert.equal(count('onDismiss'), 1);
});

test('repeated open-dismiss cycles preserve the next first presentation', () => {
    const { lifecycle, count, flush, open } = setup();
    for (let cycle = 0; cycle < 20; cycle++) {
        lifecycle.dismiss();
        open();
        lifecycle.dismiss();
        lifecycle.onChange(-1);
        lifecycle.onDismiss();
        flush();
    }
    assert.equal(count('present'), 20);
    assert.equal(count('dismiss'), 20);
    assert.equal(count('onDismiss'), 20);
});

test('cancelled presentation releases caller state without dismissing an unmounted native sheet', () => {
    const { lifecycle, count, calls, flush } = setup();
    lifecycle.present();
    lifecycle.dismiss();
    flush();
    assert.equal(count('present'), 0);
    assert.equal(count('dismiss'), 0);
    assert.deepEqual(calls, [['onDismiss', { programmatic: true }]]);
    lifecycle.dismiss();
    assert.equal(count('onDismiss'), 1);
});

test('effect cleanup and reactivation retain a pending presentation in Strict Mode', () => {
    const { lifecycle, count, flush } = setup();
    lifecycle.present();
    lifecycle.dispose();
    flush();
    assert.equal(count('present'), 0);
    lifecycle.activate();
    flush();
    assert.equal(count('present'), 1);
});
