import { getAutoDriveSimulationIsActive } from '../auto-play-drive-simulation';
import { getLocationWithDrivingMotionState } from './driving-location-state';
import { getDrivingMotionState } from './driving-motion-state';
import { getLocationCourseHeading, getLocationUpdate } from './geo';
import { locationUpdateIsStale } from './location-watch-options';
import { getSharedMapUserLocation, setSharedMapUserLocation } from './shared-map-preferences-sync';

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
