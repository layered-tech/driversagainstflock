import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    FOLLOW_ZOOM_UPDATE_EPSILON,
    getFollowZoomUpdate,
} from '../follow-zoom-update.js';

describe('getFollowZoomUpdate', () => {
    test('queues a changed speed-derived zoom for the next location', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                deferUntilNextLocation: true,
                nextZoomLevel: 17.5,
            }),
            {
                deferUntilNextLocation: true,
                shouldUpdate: true,
            },
        );
    });

    test('does not queue an unchanged or user-overridden zoom', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                deferUntilNextLocation: true,
                nextZoomLevel: 18 - FOLLOW_ZOOM_UPDATE_EPSILON / 2,
            }),
            {
                deferUntilNextLocation: false,
                shouldUpdate: false,
            },
        );
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                deferUntilNextLocation: true,
                nextZoomLevel: 17.5,
                userZoomOverrideIsActive: true,
            }),
            {
                deferUntilNextLocation: false,
                shouldUpdate: false,
            },
        );
    });

    test('keeps forced start and recenter updates immediate', () => {
        assert.deepEqual(
            getFollowZoomUpdate({
                currentZoomLevel: 18,
                deferUntilNextLocation: true,
                force: true,
                nextZoomLevel: 18,
                userZoomOverrideIsActive: true,
            }),
            {
                deferUntilNextLocation: false,
                shouldUpdate: true,
            },
        );
    });
});
