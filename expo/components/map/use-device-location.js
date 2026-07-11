import {
    isSupported as mapboxNavigationLocationIsSupported,
    useEnhancedLocation,
} from '@rnmapbox/navigation';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
    getLocationCompassHeading,
    getLocationCourseHeading,
    getLocationUpdate,
    getSmoothedCourseHeading,
} from './geo';

const DEFAULT_LOCATION_WATCH_OPTIONS = {
    accuracy: Location.Accuracy.High,
    distanceInterval: 1,
    timeInterval: 1000,
};
const DRIVING_LOCATION_WATCH_OPTIONS = {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 0,
    mayShowUserSettingsDialog: true,
    timeInterval: 250,
};

let lastLoggedEnhancedSpeedLimitKey = '';
let foregroundEnhancedLocationWatchCount = 0;
let foregroundEnhancedLocationWatchIsActive = false;
const foregroundEnhancedLocationWatchListeners = new Set();

function getForegroundEnhancedLocationWatchIsActive() {
    return foregroundEnhancedLocationWatchIsActive;
}

function emitForegroundEnhancedLocationWatchActivity() {
    foregroundEnhancedLocationWatchListeners.forEach((listener) =>
        listener(foregroundEnhancedLocationWatchIsActive),
    );
}

function updateForegroundEnhancedLocationWatchActivity(delta) {
    foregroundEnhancedLocationWatchCount = Math.max(
        0,
        foregroundEnhancedLocationWatchCount + delta,
    );

    const nextIsActive = foregroundEnhancedLocationWatchCount > 0;

    if (foregroundEnhancedLocationWatchIsActive === nextIsActive) {
        return;
    }

    foregroundEnhancedLocationWatchIsActive = nextIsActive;
    emitForegroundEnhancedLocationWatchActivity();
}

function getFiniteLocationNumber(value) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function logEnhancedSpeedLimit(speedLimit) {
    if (!__DEV__) {
        return;
    }

    const key = [
        speedLimit.speed ?? '',
        speedLimit.unit ?? '',
        speedLimit.sign ?? '',
        speedLimit.speedLimitMph ?? '',
    ].join(':');

    if (key === lastLoggedEnhancedSpeedLimitKey) {
        return;
    }

    lastLoggedEnhancedSpeedLimitKey = key;
    console.info('[MapboxNavigation] Speed limit parsed', speedLimit);
}

function getEnhancedSpeedLimit(location) {
    const speedLimit = location?.speedLimit;
    const speedLimitMph = getFiniteLocationNumber(speedLimit?.speedLimitMph);

    if (speedLimitMph === null) {
        return null;
    }

    const speed = getFiniteLocationNumber(speedLimit?.speed);

    const parsedSpeedLimit = {
        maxspeed:
            speed !== null && speedLimit?.unit
                ? `${speed} ${speedLimit.unit}`
                : '',
        sign: typeof speedLimit?.sign === 'string' ? speedLimit.sign : '',
        speed,
        speedLimitMph,
        unit: typeof speedLimit?.unit === 'string' ? speedLimit.unit : 'mph',
    };

    logEnhancedSpeedLimit(parsedSpeedLimit);

    return parsedSpeedLimit;
}

function getRoadComponent(component) {
    const text =
        typeof component?.text === 'string' ? component.text.trim() : '';
    const language =
        typeof component?.language === 'string' ? component.language : '';
    const imageBaseUrl =
        typeof component?.imageBaseUrl === 'string'
            ? component.imageBaseUrl
            : '';

    if (!text && !language && !imageBaseUrl) {
        return null;
    }

    return {
        ...(imageBaseUrl ? { imageBaseUrl } : {}),
        ...(language ? { language } : {}),
        ...(text ? { text } : {}),
    };
}

function getEnhancedRoadContext(location) {
    const roadContext = location?.roadContext;
    const components = Array.isArray(roadContext?.components)
        ? roadContext.components.map(getRoadComponent).filter(Boolean)
        : [];
    const primaryText =
        typeof roadContext?.primaryText === 'string'
            ? roadContext.primaryText.trim()
            : (components.find((component) => component.text)?.text ?? '');
    const edgeMatchProbability = getFiniteLocationNumber(
        roadContext?.edgeMatchProbability ?? location?.roadEdgeMatchProbability,
    );
    const zLevel = getFiniteLocationNumber(
        roadContext?.zLevel ?? location?.zLevel,
    );
    const edgeId =
        typeof roadContext?.edgeId === 'string'
            ? roadContext.edgeId
            : typeof location?.roadEdgeId === 'string'
              ? location.roadEdgeId
              : '';

    if (
        !primaryText &&
        !components.length &&
        !edgeId &&
        edgeMatchProbability === null &&
        zLevel === null
    ) {
        return null;
    }

    return {
        components,
        edgeId,
        edgeMatchProbability,
        inTunnel: roadContext?.inTunnel === true || location?.inTunnel === true,
        isDegradedMapMatching:
            roadContext?.isDegradedMapMatching === true ||
            location?.isDegradedMapMatching === true,
        isOffRoad:
            roadContext?.isOffRoad === true || location?.isOffRoad === true,
        primaryText,
        zLevel,
    };
}

export function getEnhancedLocationUpdate(location) {
    const latitude = getFiniteLocationNumber(location?.latitude);
    const longitude = getFiniteLocationNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    const heading = getFiniteLocationNumber(
        location?.bearing ?? location?.course,
    );
    const speed = getFiniteLocationNumber(location?.speed);
    const accuracy = getFiniteLocationNumber(
        location?.accuracy ?? location?.horizontalAccuracy,
    );
    const altitude = getFiniteLocationNumber(location?.altitude);
    const timestamp =
        getFiniteLocationNumber(location?.timestamp) ?? Date.now();

    return {
        coords: {
            accuracy: accuracy ?? undefined,
            altitude: altitude ?? undefined,
            course: heading ?? undefined,
            heading: heading ?? undefined,
            latitude,
            longitude,
            speed: speed ?? undefined,
        },
        mapboxNavigation: {
            isDegradedMapMatching: location?.isDegradedMapMatching === true,
            inTunnel: location?.inTunnel === true,
            isOffRoad: location?.isOffRoad === true,
            isTeleport: location?.isTeleport === true,
            offRoadProbability: getFiniteLocationNumber(
                location?.offRoadProbability,
            ),
            roadContext: getEnhancedRoadContext(location),
            speedLimit: getEnhancedSpeedLimit(location),
        },
        timestamp,
    };
}

export function mapboxNavigationEnhancedLocationIsSupported() {
    return mapboxNavigationLocationIsSupported();
}

export function useForegroundEnhancedLocationWatchIsActive() {
    const [isActive, setIsActive] = useState(
        getForegroundEnhancedLocationWatchIsActive,
    );

    useEffect(() => {
        foregroundEnhancedLocationWatchListeners.add(setIsActive);
        setIsActive(getForegroundEnhancedLocationWatchIsActive());

        return () => {
            foregroundEnhancedLocationWatchListeners.delete(setIsActive);
        };
    }, []);

    return isActive;
}

export function useCurrentLocation({
    currentCourseHeadingRef,
    isMountedRef,
    setUserLocation,
}) {
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState('');

    const findCurrentLocation = useCallback(async () => {
        setIsLocating(true);
        setLocationError('');

        try {
            const position = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            if (!isMountedRef.current) {
                return null;
            }

            const nextLocation = getLocationUpdate(position);

            if (!nextLocation) {
                setLocationError('Your current location is not available yet.');
                return null;
            }

            const nextHeading = getLocationCourseHeading(position);

            if (nextHeading !== null) {
                currentCourseHeadingRef.current = getSmoothedCourseHeading(
                    currentCourseHeadingRef.current,
                    nextHeading,
                );
            }

            const currentLocation = {
                ...nextLocation,
                ...(currentCourseHeadingRef.current !== null
                    ? { heading: currentCourseHeadingRef.current }
                    : {}),
                recordedAt: Date.now(),
            };

            setUserLocation(currentLocation);

            return currentLocation;
        } catch {
            if (isMountedRef.current) {
                setLocationError('Your current location is not available yet.');
            }

            return null;
        } finally {
            if (isMountedRef.current) {
                setIsLocating(false);
            }
        }
    }, [currentCourseHeadingRef, isMountedRef, setUserLocation]);

    return {
        findCurrentLocation,
        isLocating,
        locationError,
        setLocationError,
    };
}

export function useLocationWatch({
    enabled = true,
    handleUserLocationUpdate,
    isDrivingMode,
    isMountedRef,
    locationAccessGranted,
    setLocationError,
}) {
    useEffect(() => {
        if (!enabled || !locationAccessGranted || !handleUserLocationUpdate) {
            return undefined;
        }
        let isActive = true;
        let subscription = null;

        Location.watchPositionAsync(
            isDrivingMode
                ? DRIVING_LOCATION_WATCH_OPTIONS
                : DEFAULT_LOCATION_WATCH_OPTIONS,
            (location) => {
                if (isActive) {
                    handleUserLocationUpdate(location);
                }
            },
        )
            .then((nextSubscription) => {
                if (isActive) {
                    subscription = nextSubscription;
                    return;
                }

                nextSubscription.remove();
            })
            .catch(() => {
                if (isMountedRef.current) {
                    setLocationError(
                        'Your current location is not available yet.',
                    );
                }
            });

        return () => {
            isActive = false;
            subscription?.remove();
        };
    }, [
        enabled,
        handleUserLocationUpdate,
        isDrivingMode,
        isMountedRef,
        locationAccessGranted,
        setLocationError,
    ]);

    return null;
}

export function useEnhancedLocationWatch({
    enabled = true,
    foregroundService = false,
    handleUserLocationUpdate,
    isMountedRef,
}) {
    const enhancedLocation = useEnhancedLocation({
        enabled,
        foregroundService,
    });

    useEffect(() => {
        if (!enabled || !foregroundService) {
            return undefined;
        }

        updateForegroundEnhancedLocationWatchActivity(1);

        return () => {
            updateForegroundEnhancedLocationWatchActivity(-1);
        };
    }, [enabled, foregroundService]);

    useEffect(() => {
        if (!enabled || !handleUserLocationUpdate || !isMountedRef.current) {
            return;
        }

        const location = getEnhancedLocationUpdate(enhancedLocation);

        if (location) {
            handleUserLocationUpdate(location);
        }
    }, [enabled, enhancedLocation, handleUserLocationUpdate, isMountedRef]);

    return null;
}

export function useHeadingWatch({
    handleHeadingUpdate,
    isDrivingMode,
    locationAccessGranted,
}) {
    useEffect(() => {
        if (!locationAccessGranted || !isDrivingMode || !handleHeadingUpdate) {
            return undefined;
        }

        let isActive = true;
        let subscription = null;

        Location.watchHeadingAsync((heading) => {
            if (!isActive) {
                return;
            }

            const nextHeading = getLocationCompassHeading(heading);

            if (nextHeading !== null) {
                handleHeadingUpdate(nextHeading);
            }
        })
            .then((nextSubscription) => {
                if (isActive) {
                    subscription = nextSubscription;
                    return;
                }

                nextSubscription.remove();
            })
            .catch(() => {});

        return () => {
            isActive = false;
            subscription?.remove();
        };
    }, [handleHeadingUpdate, isDrivingMode, locationAccessGranted]);

    return null;
}
