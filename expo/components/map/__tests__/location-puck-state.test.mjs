import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getLocationPuckCameraOwnershipKey,
    isLocationPuckProviderReady,
    shouldShowNavigationPuck,
    shouldSuppressLocationPuck2DFallback,
    shouldUseAutoPlayNavigationPuckImages,
} from '../location-puck-state.js';

describe('location puck state', () => {
    test('holds Android puck and follow activation while shared location is unavailable', () => {
        for (const providerStatus of [
            'inactive',
            'waiting-location',
            'preparing-native',
            'recovering',
        ]) {
            for (const isDrivingMode of [false, true]) {
                assert.equal(
                    isLocationPuckProviderReady({
                        platform: 'android',
                        usesSharedLocationProvider: true,
                        isDrivingMode,
                        providerStatus,
                    }),
                    false,
                    providerStatus,
                );
            }
        }
        for (const providerStatus of ['native', 'fallback', 'unsupported']) {
            assert.equal(
                isLocationPuckProviderReady({
                    platform: 'android',
                    usesSharedLocationProvider: true,
                    isDrivingMode: false,
                    providerStatus,
                }),
                true,
                providerStatus,
            );
        }
    });

    test('preserves iOS and maps that deliberately use the device provider', () => {
        assert.equal(
            isLocationPuckProviderReady({
                platform: 'ios',
                usesSharedLocationProvider: true,
                isDrivingMode: true,
                providerStatus: 'inactive',
            }),
            true,
        );
        assert.equal(
            isLocationPuckProviderReady({
                platform: 'android',
                usesSharedLocationProvider: false,
                isDrivingMode: false,
                providerStatus: 'inactive',
            }),
            true,
        );
        assert.equal(
            isLocationPuckProviderReady({
                platform: 'android',
                usesSharedLocationProvider: false,
                isDrivingMode: true,
                providerStatus: 'inactive',
            }),
            false,
        );
    });

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

    test('keeps the standard two-dimensional puck outside navigation', () => {
        assert.equal(
            shouldShowNavigationPuck({
                isDrivingMode: false,
                navigationPuckVariant: 'default',
            }),
            false,
        );
    });

    test('suppresses the 2D fallback during native 3D transitions', () => {
        for (const locationPuck3DStatus of [
            'preparing',
            'active',
            'clearing',
        ]) {
            assert.equal(
                shouldSuppressLocationPuck2DFallback({
                    locationPuck3DStatus,
                    locationPuckRequests3D: false,
                }),
                true,
            );
        }

        assert.equal(
            shouldSuppressLocationPuck2DFallback({
                locationPuck3DStatus: 'failed',
                locationPuckRequests3D: true,
            }),
            false,
        );
        assert.equal(
            shouldSuppressLocationPuck2DFallback({
                locationPuck3DStatus: 'inactive',
                locationPuckRequests3D: false,
            }),
            false,
        );
    });

    test('tracks follow-camera ownership changes', () => {
        assert.equal(getLocationPuckCameraOwnershipKey(true), 'follow-camera');
        assert.equal(
            getLocationPuckCameraOwnershipKey(false),
            'external-or-idle-camera',
        );
    });
});
