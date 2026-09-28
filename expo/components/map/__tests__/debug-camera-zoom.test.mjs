import assert from 'node:assert/strict';
import test from 'node:test';
import {
    addDebugCameraZoomListener,
    applyDebugCameraZoomLevel,
    setDebugCameraZoomLevel,
} from '../debug-camera-zoom.js';

test('camera zoom commands reach active maps and preserve decimal values', () => {
    const phoneZooms = [];
    const autoPlayZooms = [];
    const stopPhone = addDebugCameraZoomListener((zoom) =>
        phoneZooms.push(zoom),
    );
    const stopAutoPlay = addDebugCameraZoomListener((zoom) =>
        autoPlayZooms.push(zoom),
    );

    assert.equal(setDebugCameraZoomLevel(13.9), true);
    assert.deepEqual(phoneZooms, [13.9]);
    assert.deepEqual(autoPlayZooms, [13.9]);

    stopAutoPlay();
    assert.equal(setDebugCameraZoomLevel(14.25), true);
    assert.deepEqual(phoneZooms, [13.9, 14.25]);
    assert.deepEqual(autoPlayZooms, [13.9]);

    stopPhone();
});

test('invalid camera zoom commands are ignored', () => {
    const received = [];
    const stop = addDebugCameraZoomListener((zoom) => received.push(zoom));

    assert.equal(setDebugCameraZoomLevel(NaN), false);
    assert.equal(setDebugCameraZoomLevel(Infinity), false);
    assert.deepEqual(received, []);

    stop();
});

test('a debug zoom updates the camera and its follow zoom', () => {
    const cameraStops = [];
    const followZooms = [];
    const currentZoomRef = { current: 18.5 };
    const applied = applyDebugCameraZoomLevel({
        cameraRef: {
            current: { setCamera: (stop) => cameraStops.push(stop) },
        },
        currentZoomRef,
        followLocationMode: {
            handleZoomLevelChange: (mode, zoom) =>
                followZooms.push({ mode, zoom }),
        },
        isMapReadyRef: { current: true },
        locationTrackingModeRef: { current: 'follow' },
        zoomLevel: 13.9,
    });

    assert.equal(applied, true);
    assert.equal(currentZoomRef.current, 13.9);
    assert.deepEqual(followZooms, [{ mode: 'follow', zoom: 13.9 }]);
    assert.deepEqual(cameraStops, [{ animationDuration: 0, zoomLevel: 13.9 }]);
});

test('a locked or unloaded map ignores the debug zoom', () => {
    const cameraStops = [];
    const cameraRef = {
        current: { setCamera: (stop) => cameraStops.push(stop) },
    };
    const currentZoomRef = { current: 18.5 };
    const followLocationMode = {
        handleZoomLevelChange: () => assert.fail('follow was changed'),
    };
    const locationTrackingModeRef = { current: 'follow' };

    for (const options of [
        { isMapReadyRef: { current: false } },
        {
            isMapReadyRef: { current: true },
            cameraUpdatesAreAllowed: () => false,
        },
    ]) {
        assert.equal(
            applyDebugCameraZoomLevel({
                cameraRef,
                currentZoomRef,
                followLocationMode,
                locationTrackingModeRef,
                zoomLevel: 13.9,
                ...options,
            }),
            false,
        );
    }

    assert.equal(currentZoomRef.current, 18.5);
    assert.deepEqual(cameraStops, []);
});
