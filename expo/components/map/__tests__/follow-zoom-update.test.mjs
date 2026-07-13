import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    FOLLOW_ZOOM_UPDATE_EPSILON,
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
});
