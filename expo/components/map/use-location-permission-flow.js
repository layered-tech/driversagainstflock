import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    LOCATION_CAMERA_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_USER_ANIMATION_DURATION_MS,
} from '../map-location-mode-shared';
import { hasPreciseLocation, waitForNextPaint } from './geo';

export function useLocationPermissionFlow({
    bottomSheetRef,
    closeTimeoutRef,
    findCurrentLocation,
    isDrivingMode,
    isMountedRef,
    mapPreferencesAreLoaded,
    startLocationModeAfterPermissionGrant,
}) {
    const requestInFlightRef = useRef(false);
    const locationStartupPermissionCheckHasRunRef = useRef(false);
    const [isRequestingLocation, setIsRequestingLocation] = useState(false);
    const [locationAccessGranted, setLocationAccessGranted] = useState(false);
    const [permissionError, setPermissionError] = useState('');
    const schedulePermissionSheetDismiss = useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }

        const cameraAnimationDuration = isDrivingMode
            ? LOCATION_CAMERA_ANIMATION_DURATION_MS
            : LOCATION_CAMERA_USER_ANIMATION_DURATION_MS;

        closeTimeoutRef.current = setTimeout(() => {
            bottomSheetRef.current?.dismiss();
        }, cameraAnimationDuration);
    }, [bottomSheetRef, closeTimeoutRef, isDrivingMode]);

    useFocusEffect(
        useCallback(() => {
            if (!mapPreferencesAreLoaded) {
                return undefined;
            }

            if (
                locationStartupPermissionCheckHasRunRef.current &&
                !isDrivingMode
            ) {
                return undefined;
            }

            let isActive = true;

            async function presentPermissionSheetIfNeeded() {
                let permission;

                try {
                    permission = await Location.getForegroundPermissionsAsync();
                } catch {
                    permission = null;
                }

                if (!isActive || !isMountedRef.current) {
                    return;
                }

                locationStartupPermissionCheckHasRunRef.current = true;

                if (hasPreciseLocation(permission)) {
                    setLocationAccessGranted(true);
                    const currentLocation = await findCurrentLocation();

                    if (currentLocation && isActive && isMountedRef.current) {
                        startLocationModeAfterPermissionGrant(currentLocation);
                    }
                    return;
                }

                bottomSheetRef.current?.present();
            }

            presentPermissionSheetIfNeeded();

            return () => {
                isActive = false;
                bottomSheetRef.current?.dismiss();
            };
        }, [
            bottomSheetRef,
            findCurrentLocation,
            isDrivingMode,
            isMountedRef,
            mapPreferencesAreLoaded,
            startLocationModeAfterPermissionGrant,
        ]),
    );

    const requestLocationAccess = useCallback(async () => {
        if (requestInFlightRef.current) {
            return;
        }

        requestInFlightRef.current = true;
        setIsRequestingLocation(true);
        setPermissionError('');

        try {
            await waitForNextPaint();

            const permission =
                await Location.requestForegroundPermissionsAsync();

            if (!isMountedRef.current) {
                return;
            }

            if (!hasPreciseLocation(permission)) {
                setPermissionError(
                    permission.granted
                        ? 'Precise location is off. Enable precise location and try again.'
                        : 'Location access was not granted. You can continue when you are ready.',
                );
                return;
            }

            setLocationAccessGranted(true);

            const currentLocation = await findCurrentLocation();

            if (currentLocation && isMountedRef.current) {
                startLocationModeAfterPermissionGrant(currentLocation);
                schedulePermissionSheetDismiss();
            }
        } catch {
            if (isMountedRef.current) {
                setPermissionError(
                    'Location access could not be requested. Please try again.',
                );
            }
        } finally {
            requestInFlightRef.current = false;

            if (isMountedRef.current) {
                setIsRequestingLocation(false);
            }
        }
    }, [
        findCurrentLocation,
        isMountedRef,
        schedulePermissionSheetDismiss,
        startLocationModeAfterPermissionGrant,
    ]);

    const retryCurrentLocation = useCallback(async () => {
        const currentLocation = await findCurrentLocation();

        if (currentLocation) {
            startLocationModeAfterPermissionGrant(currentLocation);
            schedulePermissionSheetDismiss();
        }
    }, [
        findCurrentLocation,
        schedulePermissionSheetDismiss,
        startLocationModeAfterPermissionGrant,
    ]);

    return {
        isRequestingLocation,
        locationAccessGranted,
        permissionError,
        requestLocationAccess,
        retryCurrentLocation,
    };
}
