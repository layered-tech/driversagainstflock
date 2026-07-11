import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef } from 'react';
import { normalizeDirectionDegrees, normalizeLongitude } from './geo';

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
    const heading = courseHeading ?? compassHeading;
    const resolvedFallbackHeading = normalizeOptionalHeading(fallbackHeading);
    const recordedAt =
        getFiniteNumber(
            isMoving
                ? location?.recordedAt
                : location?.compassHeadingRecordedAt,
        ) ?? getFiniteNumber(location?.recordedAt);

    return {
        coordinate: [normalizeLongitude(longitude), latitude],
        heading: heading ?? resolvedFallbackHeading ?? 0,
        recordedAt: recordedAt ?? undefined,
    };
}

function useDrivingProviderLocation({ isDrivingMode, userLocation }) {
    const fallbackHeadingRef = useRef(0);
    const providerLocation = useMemo(() => {
        if (!isDrivingMode) {
            return null;
        }

        return getDrivingProviderLocation(
            userLocation,
            fallbackHeadingRef.current,
        );
    }, [
        isDrivingMode,
        userLocation?.compassHeading,
        userLocation?.compassHeadingRecordedAt,
        userLocation?.courseHeading,
        userLocation?.heading,
        userLocation?.isMoving,
        userLocation?.latitude,
        userLocation?.longitude,
        userLocation?.recordedAt,
    ]);

    useEffect(() => {
        if (!isDrivingMode || !providerLocation) {
            fallbackHeadingRef.current = 0;
            return;
        }

        fallbackHeadingRef.current = providerLocation.heading;
    }, [isDrivingMode, providerLocation]);

    return providerLocation;
}

export function DrivingLocationProvider({ isDrivingMode, userLocation }) {
    const providerLocation = useDrivingProviderLocation({
        isDrivingMode,
        userLocation,
    });
    const heading = Number.isFinite(providerLocation?.heading)
        ? providerLocation.heading
        : 0;

    if (!isDrivingMode || !providerLocation) {
        return null;
    }

    return (
        <Mapbox.CustomLocationProvider
            coordinate={providerLocation.coordinate}
            heading={heading}
        />
    );
}
