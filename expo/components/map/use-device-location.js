import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getLocationCompassHeading,
    getLocationCourseHeading,
    getLocationUpdate,
    getSmoothedCourseHeading,
} from './geo';
import {
    getCurrentPositionForActiveLocationSource,
    getLocationWatchOptions,
    isRoadMatchedLocationUpdate,
} from './location-watch-options';
import {
    addRoadMatchedLocationListener,
    getLastRoadMatchedLocationAsync,
    retainRoadMatchingSessionAsync,
    roadMatchingLocationIsSupported,
} from './road-matching-session';

export { roadMatchingLocationIsSupported } from './road-matching-session';

let persistentRoadMatchingWatchCount = 0;
let persistentRoadMatchingWatchIsActive = false;
const persistentRoadMatchingWatchListeners = new Set();

function getPersistentRoadMatchingWatchIsActive() {
    return persistentRoadMatchingWatchIsActive;
}

function emitPersistentRoadMatchingWatchActivity() {
    persistentRoadMatchingWatchListeners.forEach((listener) =>
        listener(persistentRoadMatchingWatchIsActive),
    );
}

function updatePersistentRoadMatchingWatchActivity(delta) {
    persistentRoadMatchingWatchCount = Math.max(
        0,
        persistentRoadMatchingWatchCount + delta,
    );

    const nextIsActive = persistentRoadMatchingWatchCount > 0;

    if (persistentRoadMatchingWatchIsActive === nextIsActive) {
        return;
    }

    persistentRoadMatchingWatchIsActive = nextIsActive;
    emitPersistentRoadMatchingWatchActivity();
}

export function usePersistentRoadMatchingWatchIsActive() {
    const [isActive, setIsActive] = useState(
        getPersistentRoadMatchingWatchIsActive,
    );

    useEffect(() => {
        persistentRoadMatchingWatchListeners.add(setIsActive);
        setIsActive(getPersistentRoadMatchingWatchIsActive());

        return () => {
            persistentRoadMatchingWatchListeners.delete(setIsActive);
        };
    }, []);

    return isActive;
}

export function useCurrentLocation({
    currentCourseHeadingRef,
    isMountedRef,
    roadMatchedLocationWatchEnabledRef,
    setUserLocation,
}) {
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState('');

    const findCurrentLocation = useCallback(async () => {
        setIsLocating(true);
        setLocationError('');

        try {
            const position = await getCurrentPositionForActiveLocationSource({
                getCurrentPositionAsync: () =>
                    Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.High,
                    }),
                getLastRoadMatchedLocation: getLastRoadMatchedLocationAsync,
                isMountedRef,
                roadMatchedLocationWatchEnabledRef,
            });

            if (!isMountedRef.current) {
                return null;
            }

            if (!position) {
                setLocationError('Your current location is not available yet.');
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

            if (!isRoadMatchedLocationUpdate(position)) {
                setUserLocation(currentLocation);
            }

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
    }, [
        currentCourseHeadingRef,
        isMountedRef,
        roadMatchedLocationWatchEnabledRef,
        setUserLocation,
    ]);

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
    isLocationTrackingActive = false,
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
            getLocationWatchOptions({
                accuracies: Location.Accuracy,
                isDrivingMode,
                isLocationTrackingActive,
            }),
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
        isLocationTrackingActive,
        isMountedRef,
        locationAccessGranted,
        setLocationError,
    ]);

    return null;
}

export function useRoadMatchedLocationWatch({
    enabled = true,
    handleUserLocationUpdate,
    isMountedRef,
    persistent = false,
}) {
    const handleUserLocationUpdateRef = useRef(handleUserLocationUpdate);
    const handleUserLocationUpdateIsAvailable =
        typeof handleUserLocationUpdate === 'function';

    handleUserLocationUpdateRef.current = handleUserLocationUpdate;

    useEffect(() => {
        if (!enabled || !persistent) {
            return undefined;
        }

        updatePersistentRoadMatchingWatchActivity(1);

        return () => {
            updatePersistentRoadMatchingWatchActivity(-1);
        };
    }, [enabled, persistent]);

    useEffect(() => {
        if (
            !enabled ||
            !handleUserLocationUpdateIsAvailable ||
            !isMountedRef.current ||
            !roadMatchingLocationIsSupported()
        ) {
            return undefined;
        }

        let isActive = true;
        let sessionHandle = null;
        const handleLocation = (location) => {
            if (isActive && isMountedRef.current) {
                handleUserLocationUpdateRef.current?.(location);
            }
        };
        const locationSubscription =
            addRoadMatchedLocationListener(handleLocation);

        getLastRoadMatchedLocationAsync()
            .then((location) => {
                if (location) {
                    handleLocation(location);
                }
            })
            .catch(() => {});

        retainRoadMatchingSessionAsync({ persistent }).then((handle) => {
            if (isActive) {
                sessionHandle = handle;
            } else {
                handle.remove();
            }
        });

        return () => {
            isActive = false;
            locationSubscription.remove();
            sessionHandle?.remove();
        };
    }, [
        enabled,
        handleUserLocationUpdateIsAvailable,
        isMountedRef,
        persistent,
    ]);

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
