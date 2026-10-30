import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentMapState } from '../persistent-map-state.js';

test('route handoff retains the last map frame and ignores stale cleanup', () => {
    const state = createPersistentMapState();
    const map = {};
    const scorecard = {};
    state.publish(map, { children: 'camera layers' });
    state.release(map);
    assert.equal(state.getSnapshot().children, 'camera layers');
    state.publish(scorecard, { children: 'trail layers' });
    const focused = state.getSnapshot();
    state.release(map);
    assert.equal(state.getSnapshot(), focused);
    assert.equal(focused.owner, scorecard);
});

test('focused route updates layers and subscriptions can be removed', () => {
    const state = createPersistentMapState();
    const owner = {};
    let updates = 0;
    const unsubscribe = state.subscribe(() => updates++);
    state.publish(owner, { children: 'area boundary' });
    state.publish(owner, { children: 'area changes' });
    assert.equal(state.getSnapshot().children, 'area changes');
    assert.equal(updates, 2);
    unsubscribe();
    state.publish(owner, { children: 'alert settings' });
    assert.equal(updates, 2);
});

test('panel navigation keeps the base style loaded; explicit Map style changes still apply', () => {
    const state = createPersistentMapState();
    const map = {};
    state.publish(map, { base: true, props: { styleURL: 'satellite' } });
    state.publish({}, { props: { styleURL: 'standard', scrollEnabled: true } });
    assert.equal(state.getSnapshot().props.styleURL, 'satellite');
    assert.equal(state.getSnapshot().props.scrollEnabled, true);
    state.publish(map, { base: true, props: { styleURL: 'outdoors' } });
    assert.equal(state.getSnapshot().props.styleURL, 'outdoors');
});

test('handoff resets native optional properties to valid values instead of null', () => {
    const state = createPersistentMapState();
    state.publish(
        {},
        { props: { zoomEnabled: false, preferredFramesPerSecond: 30 } },
    );
    assert.equal(state.getSnapshot().props.zoomEnabled, false);
    state.publish({}, { props: {} });
    assert.equal(state.getSnapshot().props.zoomEnabled, true);
    assert.equal(state.getSnapshot().props.preferredFramesPerSecond, 60);
    assert.equal(state.getSnapshot().props.projection, 'mercator');
    assert.deepEqual(state.getSnapshot().props.logoPosition, {
        left: 8,
        bottom: 8,
    });
});

test('scene state retains inactive panels until their routes are actually removed', async () => {
    const { createPersistentSceneState } =
        await import('../persistent-map-state.js');
    const state = createPersistentSceneState();
    state.publish('map', { focused: true, children: 'map controls' });
    state.publish('map', { focused: false, children: 'map controls' });
    state.publish('areas', { focused: true, children: 'area panel' });
    assert.equal(state.getSnapshot().length, 2);
    assert.equal(
        state.getSnapshot().filter((scene) => scene.focused)[0].id,
        'areas',
    );
    state.release('areas');
    assert.deepEqual(
        state.getSnapshot().map((scene) => scene.id),
        ['map'],
    );
});
