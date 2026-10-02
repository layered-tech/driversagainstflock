import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createFollowSpeedZoomController,
    FOLLOW_SPEED_ZOOM_RETURN_DEBOUNCE_MS,
    FOLLOW_ZOOM_UPDATE_EPSILON,
    FOLLOW_ZOOM_UPDATE_INTERVAL_MS,
    getFollowZoomUpdate,
} from '../follow-zoom-update.js';

describe('getFollowZoomUpdate', () => {
    test('updates a changed speed-derived zoom', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                nextZoomLevel: 17.5,
            }),
            {
                shouldUpdate: true,
            },
        );
    });

    test('does not update an unchanged or user-overridden zoom', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                nextZoomLevel: 18 - FOLLOW_ZOOM_UPDATE_EPSILON / 2,
            }),
            {
                shouldUpdate: false,
            },
        );
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                nextZoomLevel: 17.5,
                userZoomOverrideIsActive: true,
            }),
            {
                shouldUpdate: false,
            },
        );
    });

    test('allows forced start and recenter updates', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                force: true,
                nextZoomLevel: 18,
                userZoomOverrideIsActive: true,
            }),
            {
                shouldUpdate: true,
            },
        );
    });

    test('coalesces speed zoom changes without deferring normal acceleration for seconds', () => {
        const lastUpdateAt = 10_000;

        for (const elapsed of [100, 250, FOLLOW_ZOOM_UPDATE_INTERVAL_MS - 1]) {
            assert.deepEqual(
                getFollowZoomUpdate({
                    currentZoomLevel: 18,
                    lastUpdateAt,
                    nextZoomLevel: 17.5,
                    now: lastUpdateAt + elapsed,
                }),
                {
                    shouldUpdate: false,
                },
            );
        }

        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                lastUpdateAt,
                nextZoomLevel: 16.75,
                now: lastUpdateAt + FOLLOW_ZOOM_UPDATE_INTERVAL_MS,
            }),
            {
                shouldUpdate: true,
            },
        );
    });

    test('forced camera setup bypasses the speed zoom interval', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                force: true,
                lastUpdateAt: 10_000,
                nextZoomLevel: 17.5,
                now: 10_001,
            }),
            {
                shouldUpdate: true,
            },
        );
    });
});

describe('speed bracket reversal debounce', () => {
    test('forward changes stay quick while adjacent reversals require continuous confirmation', () => {
        for (const [start, next, farther] of [
            [49, 50, 55],
            [50, 49, 44],
            [64, 65, 49],
        ]) {
            const controller = createFollowSpeedZoomController();
            const update = (mph, now) =>
                controller.update({ speed: mph * 0.44704, now });
            const startZoom = update(start, 0);
            const nextZoom = update(next, 1000);
            assert.notEqual(nextZoom, startZoom);
            assert.equal(update(start, 2000), nextZoom);
            assert.equal(
                update(start, 2000 + FOLLOW_SPEED_ZOOM_RETURN_DEBOUNCE_MS - 1),
                nextZoom,
            );
            assert.equal(
                update(next, 7000),
                nextZoom,
                'crossing back cancels confirmation',
            );
            assert.equal(update(start, 8000), nextZoom);
            assert.equal(update(start, 12999), nextZoom);
            assert.equal(update(start, 13000), startZoom);
            assert.notEqual(
                update(farther, 14000),
                startZoom,
                'larger speed change bypasses debounce',
            );
        }
    });

    test('ignores out-of-order samples and forced recenter clears prior bracket history', () => {
        const controller = createFollowSpeedZoomController();
        const update = (mph, now, force = false) =>
            controller.update({ speed: mph * 0.44704, now, force });
        assert.equal(update(49, 0), 16);
        assert.equal(update(50, 1000), 15.25);
        assert.equal(update(49, 2000), 15.25);
        assert.equal(update(65, 1999), 15.25);
        assert.equal(update(49, 6999), 15.25);
        assert.equal(update(49, 7000), 16);
        assert.equal(update(50, 7100), 16);
        assert.equal(update(50, 7200, true), 15.25);
        assert.equal(update(49, 7300), 16);
        controller.reset();
        assert.equal(update(65, 0), 13.75);
    });
});
