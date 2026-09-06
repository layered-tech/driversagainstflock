export function getLocationWithDrivingMotionState({
    compassHeading,
    courseHeading,
    motionState,
    nextLocation,
    previousLocation,
}) {
    const activeCourseHeading = motionState.isMoving ? courseHeading : null;
    const heading = activeCourseHeading ?? previousLocation?.heading ?? null;

    return {
        ...nextLocation,
        ...(motionState.speed !== null ? { speed: motionState.speed } : {}),
        isMoving: motionState.isMoving,
        ...(activeCourseHeading !== null
            ? {
                  courseHeading: activeCourseHeading,
              }
            : {}),
        ...(heading !== null ? { heading } : {}),
        ...(compassHeading !== null ? { compassHeading } : {}),
    };
}
