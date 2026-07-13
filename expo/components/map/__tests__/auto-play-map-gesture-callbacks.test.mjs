import assert from 'node:assert/strict';
import test from 'node:test';
import { getAutoPlayMapGestureCallbacks } from '../../auto-play-map-gesture-callbacks.js';

test('registers the Android Auto pan-mode callback with map gestures', () => {
    const panEvents = [];
    const zoomEvents = [];
    const panModeEvents = [];
    const callbacks = getAutoPlayMapGestureCallbacks({
        onPanningInterfaceChanged: (isVisible) => {
            panModeEvents.push(isVisible);
        },
        onPan: (translation) => {
            panEvents.push(translation);
        },
        onZoomGesture: (center, scale) => {
            zoomEvents.push({ center, scale });
        },
    });

    callbacks.onDidChangePanningInterface(true);
    callbacks.onDidPan({ x: 12, y: -8 });
    callbacks.onDidUpdateZoomGestureWithCenter({ x: 20, y: 30 }, 1.5);

    assert.deepEqual(panModeEvents, [true]);
    assert.deepEqual(panEvents, [{ x: 12, y: -8 }]);
    assert.deepEqual(zoomEvents, [{ center: { x: 20, y: 30 }, scale: 1.5 }]);
});
