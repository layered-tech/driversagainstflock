import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createNavigationPuckLifecycle } from '../navigation-puck-lifecycle.js';

const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);

function makeLifecycle({ apply, clear, statuses = [] } = {}) {
    return createNavigationPuckLifecycle({
        applyNavigationPuck:
            apply ??
            (async () => {
                return true;
            }),
        clearNavigationPuck:
            clear ??
            (async () => {
                return true;
            }),
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

describe('navigation puck lifecycle', () => {
    test('prepares before applying so the fallback can unmount first', async () => {
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
        assert.deepEqual(statuses, ['preparing']);

        await requestPuck(lifecycle, mapViewRef);

        assert.equal(applyCount, 1);
        assert.equal(lifecycle.getStatus(), 'active');
        assert.deepEqual(statuses, ['preparing', 'active']);
    });

    test('does not apply while the map ref is unresolved', async () => {
        let applyCount = 0;
        const lifecycle = makeLifecycle({
            apply: async () => {
                applyCount += 1;

                return true;
            },
        });

        await requestPuck(lifecycle, { current: null });
        await requestPuck(lifecycle, { current: null });

        assert.equal(applyCount, 0);
        assert.equal(lifecycle.getStatus(), 'failed');
    });

    test('captures the map instance before queued work starts', async () => {
        const firstMap = { id: 'first-map' };
        const secondMap = { id: 'second-map' };
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
        mapViewRef.current = secondMap;

        await request;

        assert.deepEqual(appliedMaps, [firstMap]);
    });

    test('invalidates old work without clearing a replacement map', async () => {
        const firstMap = { id: 'first-map' };
        const secondMap = { id: 'second-map' };
        const mapViewRef = { current: firstMap };
        const appliedMaps = [];
        const clearedMaps = [];
        let finishFirstApply;
        const firstApplyIsPending = new Promise((resolve) => {
            finishFirstApply = resolve;
        });
        const lifecycle = makeLifecycle({
            apply: async (mapView) => {
                appliedMaps.push(mapView.current);

                if (mapView.current === firstMap) {
                    await firstApplyIsPending;
                }

                return true;
            },
            clear: async (mapView) => {
                clearedMaps.push(mapView.current);

                return true;
            },
        });

        await requestPuck(lifecycle, mapViewRef);
        const firstRequest = requestPuck(lifecycle, mapViewRef);
        await Promise.resolve();

        lifecycle.invalidate();
        mapViewRef.current = secondMap;
        const secondRequest = requestPuck(lifecycle, mapViewRef);
        finishFirstApply();

        await Promise.all([firstRequest, secondRequest]);

        assert.deepEqual(appliedMaps, [firstMap, secondMap]);
        assert.deepEqual(clearedMaps, []);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('refreshes an active puck without clearing it first', async () => {
        const mapViewRef = { current: { id: 'map' } };
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

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);

        assert.deepEqual(operations, ['apply', 'apply']);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('skips a stale clear when the puck is requested again', async () => {
        const mapViewRef = { current: { id: 'map' } };
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

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);
        const clearRequest = requestPuck(lifecycle, mapViewRef, false);
        const restoreRequest = requestPuck(lifecycle, mapViewRef);

        await Promise.all([clearRequest, restoreRequest]);
        await requestPuck(lifecycle, mapViewRef);

        assert.deepEqual(operations, ['apply', 'apply']);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('clears the captured map when the puck is no longer requested', async () => {
        const map = { id: 'map' };
        const mapViewRef = { current: map };
        const clearedMaps = [];
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

    test('can retry after an apply attempted before map readiness', async () => {
        const mapViewRef = { current: { id: 'map' } };
        let mapIsReady = false;
        let applyCount = 0;
        const lifecycle = makeLifecycle({
            apply: async () => {
                applyCount += 1;

                return mapIsReady;
            },
        });

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);
        assert.equal(lifecycle.getStatus(), 'failed');

        mapIsReady = true;
        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);

        assert.equal(applyCount, 2);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('clears after a partially failed native apply', async () => {
        let clearCount = 0;
        const mapViewRef = { current: { id: 'map' } };
        const lifecycle = makeLifecycle({
            apply: async () => false,
            clear: async () => {
                clearCount += 1;

                return true;
            },
        });

        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef);
        await requestPuck(lifecycle, mapViewRef, false);

        assert.equal(clearCount, 1);
        assert.equal(lifecycle.getStatus(), 'inactive');
    });

    test('creates a fresh apply epoch after each map load', () => {
        assert.match(
            mapCanvasSource,
            /setNavigationPuckMapLoadEpoch\(\(epoch\) => epoch \+ 1\)/,
        );
        assert.match(
            mapCanvasSource,
            /navigationPuckLifecycle\.request\([\s\S]*?navigationPuckMapLoadEpoch/,
        );
        assert.match(
            mapCanvasSource,
            /onDidFinishLoadingStyle=\{[\s\S]*?refreshNavigationPuckAfterMapAttachment/,
        );
    });

    test('applies from a post-commit preparing effect', () => {
        assert.match(
            mapCanvasSource,
            /navigationPuck3DStatus !== 'preparing'[\s\S]*?requestNavigationPuck\(\)/,
        );
    });
});
