import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createLocationPuck3DLifecycle } from '../location-puck-3d-lifecycle.js';

const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);

function makeLifecycle({ apply, clear, statuses = [] } = {}) {
    return createLocationPuck3DLifecycle({
        applyLocationPuck: apply ?? (async () => true),
        clearLocationPuck: clear ?? (async () => true),
        onStatusChange: (status) => statuses.push(status),
    });
}

function requestPuck(lifecycle, mapViewRef, requested = true) {
    return lifecycle.request({
        layerAbove: undefined,
        mapViewRef,
        requested,
        scale: 75,
        slot: undefined,
    });
}

describe('3D location puck lifecycle', () => {
    test('unmounts the 2D fallback before applying the 3D puck', async () => {
        let applyCount = 0;
        const statuses = [];
        const lifecycle = makeLifecycle({
            apply: async () => {
                applyCount += 1;
                return true;
            },
            statuses,
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestPuck(lifecycle, mapViewRef);
        assert.equal(applyCount, 0);
        assert.equal(lifecycle.getStatus(), 'preparing');

        await requestPuck(lifecycle, mapViewRef);
        assert.equal(applyCount, 1);
        assert.equal(lifecycle.getStatus(), 'active');
        assert.deepEqual(statuses, ['preparing', 'active']);
    });

    test('captures the map instance before queued work starts', async () => {
        const firstMap = { id: 'first-map' };
        const mapViewRef = { current: firstMap };
        const appliedMaps = [];
        const lifecycle = makeLifecycle({
            apply: async (mapView) => {
                appliedMaps.push(mapView.current);
                return true;
            },
        });

        await requestPuck(lifecycle, mapViewRef);
        const request = requestPuck(lifecycle, mapViewRef);
        mapViewRef.current = { id: 'second-map' };
        await request;

        assert.deepEqual(appliedMaps, [firstMap]);
    });

    test('refreshes an active puck without clearing first', async () => {
        const operations = [];
        const lifecycle = makeLifecycle({
            apply: async () => {
                operations.push('apply');
                return true;
            },
            clear: async () => {
                operations.push('clear');
                return true;
            },
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);

        assert.deepEqual(operations, ['apply', 'apply']);
    });

    test('restores the fallback after a failed native apply', async () => {
        const statuses = [];
        const lifecycle = makeLifecycle({
            apply: async () => false,
            statuses,
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);

        assert.equal(lifecycle.getStatus(), 'failed');
        assert.deepEqual(statuses, ['preparing', 'failed']);
    });

    test('clears the native puck when 3D is no longer requested', async () => {
        const clearedMaps = [];
        const map = { id: 'map' };
        const mapViewRef = { current: map };
        const lifecycle = makeLifecycle({
            clear: async (mapView) => {
                clearedMaps.push(mapView.current);
                return true;
            },
        });

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef, false);

        assert.deepEqual(clearedMaps, [map]);
        assert.equal(lifecycle.getStatus(), 'inactive');
    });

    test('reapplies after map and style attachment', () => {
        assert.match(
            mapCanvasSource,
            /setLocationPuckMapLoadEpoch\(\(epoch\) => epoch \+ 1\)/,
        );
        assert.match(
            mapCanvasSource,
            /locationPuckLifecycle\.request\([\s\S]*?locationPuckMapLoadEpoch/,
        );
        assert.match(
            mapCanvasSource,
            /onDidFinishLoadingStyle=\{refreshLocationPuckAfterMapAttachment\}/,
        );
        assert.match(
            mapCanvasSource,
            /locationPuck3DStatus !== 'preparing'[\s\S]*?requestLocationPuck\(\)/,
        );
    });
});
