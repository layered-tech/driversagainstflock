import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutoPlayMapControlHandlerRegistry } from '../../auto-play-map-control-handlers.js';

test('restores the previous mounted map handlers when the latest surface unmounts', () => {
    const emptyHandlers = { handleDrivingMapViewPress: () => 'empty' };
    const registry = createAutoPlayMapControlHandlerRegistry(emptyHandlers);
    const firstHandlers = { handleDrivingMapViewPress: () => 'first' };
    const secondHandlers = { handleDrivingMapViewPress: () => 'second' };

    const unregisterFirst = registry.register(firstHandlers);
    const unregisterSecond = registry.register(secondHandlers);

    assert.equal(registry.get().handleDrivingMapViewPress(), 'second');

    unregisterSecond();

    assert.equal(registry.get().handleDrivingMapViewPress(), 'first');

    unregisterFirst();

    assert.equal(registry.get().handleDrivingMapViewPress(), 'empty');
});

test('unregistering an older surface leaves the latest handlers active', () => {
    const emptyHandlers = { handleDrivingMapViewPress: () => 'empty' };
    const registry = createAutoPlayMapControlHandlerRegistry(emptyHandlers);
    const unregisterFirst = registry.register({
        handleDrivingMapViewPress: () => 'first',
    });
    const unregisterSecond = registry.register({
        handleDrivingMapViewPress: () => 'second',
    });

    unregisterFirst();

    assert.equal(registry.get().handleDrivingMapViewPress(), 'second');

    unregisterSecond();
    unregisterSecond();

    assert.equal(registry.get().handleDrivingMapViewPress(), 'empty');
});
