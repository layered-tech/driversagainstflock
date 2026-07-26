import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeDirectionDegrees, normalizeLongitude } from './geo';
import {
    clearLocationPuckLocationProviderAsync,
    isLocationPuckLocationProviderSupported,
    setLocationPuckLocationAsync,
} from './location-puck-3d';
import { createLocationPuckProviderLifecycle } from './location-puck-provider-lifecycle';

function getFiniteNumber(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeOptionalHeading(value) {
    const heading = getFiniteNumber(value);

    return heading !== null && heading >= 0
        ? normalizeDirectionDegrees(heading)
        : undefined;
}

function getDrivingProviderLocation(location, fallbackHeading) {
    const longitude = getFiniteNumber(location?.longitude);
    const latitude = getFiniteNumber(location?.latitude);

    if (longitude === null || latitude === null) {
        return null;
    }

    const isMoving = location?.isMoving === true;
    const courseHeading = normalizeOptionalHeading(
        location?.courseHeading ?? location?.heading,
    );
    const compassHeading = normalizeOptionalHeading(location?.compassHeading);
    const heading = isMoving
        ? (courseHeading ?? compassHeading)
        : (compassHeading ?? courseHeading);
    const resolvedFallbackHeading = normalizeOptionalHeading(fallbackHeading);
    const recordedAt = getFiniteNumber(location?.recordedAt);

    return {
        coordinate: [normalizeLongitude(longitude), latitude],
        heading: heading ?? resolvedFallbackHeading ?? 0,
        recordedAt: recordedAt ?? undefined,
    };
}

function useDrivingProviderLocation({ enabled, userLocation }) {
    const fallbackHeadingRef = useRef(0);
    const providerLocation = useMemo(() => {
        if (!enabled) {
            return null;
        }

        return getDrivingProviderLocation(
            userLocation,
            fallbackHeadingRef.current,
        );
    }, [
        enabled,
        userLocation?.compassHeading,
        userLocation?.courseHeading,
        userLocation?.heading,
        userLocation?.isMoving,
        userLocation?.latitude,
        userLocation?.longitude,
        userLocation?.recordedAt,
    ]);

    useEffect(() => {
        if (!enabled || !providerLocation) {
            fallbackHeadingRef.current = 0;
            return;
        }

        fallbackHeadingRef.current = providerLocation.heading;
    }, [enabled, providerLocation]);

    return providerLocation;
}

export function DrivingLocationProvider({
    attachmentKey,
    enabled = false,
    mapViewRef,
    onNativeProviderStatusChange,
    userLocation,
}) {
    const providerLocation = useDrivingProviderLocation({
        enabled,
        userLocation,
    });
    const nativeProviderIsSupported = isLocationPuckLocationProviderSupported();
    const [nativeProviderStatus, setNativeProviderStatus] =
        useState('inactive');
    const providerLifecycleRef = useRef(null);

    if (providerLifecycleRef.current === null) {
        providerLifecycleRef.current = createLocationPuckProviderLifecycle({
            clearLocationPuck: clearLocationPuckLocationProviderAsync,
            onStatusChange: setNativeProviderStatus,
            updateLocationPuck: setLocationPuckLocationAsync,
        });
    }

    const providerLifecycle = providerLifecycleRef.current;
    const reportedNativeProviderStatus = nativeProviderIsSupported
        ? nativeProviderStatus
        : 'unsupported';
    const heading = Number.isFinite(providerLocation?.heading)
        ? providerLocation.heading
        : 0;

    useEffect(() => {
        onNativeProviderStatusChange?.(reportedNativeProviderStatus);
    }, [onNativeProviderStatusChange, reportedNativeProviderStatus]);

    useEffect(() => {
        return () => {
            onNativeProviderStatusChange?.('inactive');
        };
    }, [onNativeProviderStatusChange]);

    useEffect(() => {
        if (!nativeProviderIsSupported) {
            return;
        }

        void providerLifecycle.request({
            attachmentKey,
            enabled,
            mapViewRef,
            providerLocation,
        });
    }, [
        attachmentKey,
        enabled,
        mapViewRef,
        nativeProviderIsSupported,
        providerLifecycle,
        providerLocation,
    ]);

    useEffect(() => {
        if (
            !nativeProviderIsSupported ||
            nativeProviderStatus !== 'preparing-native'
        ) {
            return;
        }

        void providerLifecycle.request({
            attachmentKey,
            enabled,
            mapViewRef,
            providerLocation,
        });
    }, [
        attachmentKey,
        enabled,
        mapViewRef,
        nativeProviderIsSupported,
        nativeProviderStatus,
        providerLifecycle,
        providerLocation,
    ]);

    useEffect(() => {
        return () => {
            if (nativeProviderIsSupported) {
                void providerLifecycle.invalidate();
            }
        };
    }, [nativeProviderIsSupported, providerLifecycle]);

    if (!enabled || !providerLocation) {
        return null;
    }

    if (nativeProviderIsSupported && nativeProviderStatus !== 'fallback') {
        return null;
    }

    return (
        <Mapbox.CustomLocationProvider
            coordinate={providerLocation.coordinate}
            heading={heading}
        />
    );
}
