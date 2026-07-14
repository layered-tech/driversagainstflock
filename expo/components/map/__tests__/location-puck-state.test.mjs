import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getNavigationPuckCameraOwnershipKey,
    shouldShowNavigationPuck,
    shouldSuppressNavigationPuckFallback,
    shouldUseAutoPlayNavigationPuckImages,
} from '../location-puck-state.js';

describe('location puck state', () => {
    test('always uses the navigation arrow on Auto Play surfaces', () => {
        assert.equal(
            shouldShowNavigationPuck({
                isDrivingMode: false,
                isFollowing: false,
                navigationPuckVariant: 'auto-play',
            }),
            true,
        );
        assert.equal(shouldUseAutoPlayNavigationPuckImages('auto-play'), true);
    });

    test('uses the phone navigation arrow only during active navigation', () => {
        assert.equal(
            shouldShowNavigationPuck({
                isDrivingMode: true,
                isFollowing: false,
                navigationPuckVariant: 'default',
            }),
            true,
        );
        assert.equal(
            shouldShowNavigationPuck({
                isDrivingMode: false,
                isFollowing: true,
                navigationPuckVariant: 'default',
            }),
            false,
        );
        assert.equal(shouldUseAutoPlayNavigationPuckImages('default'), false);
    });

    test('suppresses the fallback while a native 3D puck is requested', () => {
        assert.equal(
            shouldSuppressNavigationPuckFallback({
                navigationPuck3DStatus: 'inactive',
                navigationPuckRequestsNative3D: true,
            }),
            true,
        );
        assert.equal(
            shouldSuppressNavigationPuckFallback({
                navigationPuck3DStatus: 'failed',
                navigationPuckRequestsNative3D: true,
            }),
            false,
        );
        assert.equal(
            shouldSuppressNavigationPuckFallback({
                navigationPuck3DStatus: 'clearing',
                navigationPuckRequestsNative3D: false,
            }),
            true,
        );
        assert.equal(
            shouldSuppressNavigationPuckFallback({
                navigationPuck3DStatus: 'inactive',
                navigationPuckRequestsNative3D: false,
            }),
            false,
        );
    });

    test('changes the native puck key with camera ownership', () => {
        assert.equal(
            getNavigationPuckCameraOwnershipKey(true),
            'rnmapbox-follow-camera',
        );
        assert.equal(
            getNavigationPuckCameraOwnershipKey(false),
            'external-or-idle-camera',
        );
    });
});
