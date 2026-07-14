import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
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

    test('coalesces speed zoom changes to one accepted location every four seconds', () => {
        const lastUpdateAt = 10_000;

        for (const elapsed of [500, 1000, 2000, 3999]) {
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
