import { Platform } from 'react-native';
import { getAutoDriveSimulationIsActive } from '../auto-play-drive-simulation';
import { getAutoPlaySessionState } from '../auto-play-session-state';
import { getLocationWithDrivingMotionState } from './driving-location-state';
import { getDrivingMotionState } from './driving-motion-state';
import { getLocationCourseHeading, getLocationUpdate } from './geo';
import { locationUpdateIsStale } from './location-watch-options';
import {
    getSharedMapUserLocation,
    setSharedMapUserLocation,
} from './shared-map-preferences-sync';

export function publishPhoneMapLocation(location) {
    // The phone can still smooth its own follow camera. The connected CarPlay
    // displays share the position and road bearing published by the matcher.
    if (Platform.OS === 'ios' && getAutoPlaySessionState().isConnected) {
        return;
    }

    setSharedMapUserLocation(location);
}

/** Publishes car-owned fixes even when only a secondary display is mounted. */
export function publishSharedRoadMatchedLocation(position) {
    if (getAutoDriveSimulationIsActive()) return;
    const nextLocation = getLocationUpdate(position);
    const previousLocation = getSharedMapUserLocation();

    if (
        !nextLocation ||
        locationUpdateIsStale({
            currentLocation: previousLocation,
            nextLocation,
        })
    ) {
        return;
    }

    const motionState = getDrivingMotionState({
        fallbackCourseHeading:
            previousLocation?.courseHeading ??
            previousLocation?.heading ??
            null,
        locationCourseHeading: getLocationCourseHeading(position),
        nextLocation,
        previousLocation,
    });

    setSharedMapUserLocation(
        getLocationWithDrivingMotionState({
            compassHeading: previousLocation?.compassHeading ?? null,
            courseHeading: motionState.courseHeading,
            motionState,
            nextLocation,
            previousLocation,
        }),
    );
}
