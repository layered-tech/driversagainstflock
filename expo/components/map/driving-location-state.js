export function getLocationWithDrivingMotionState({
    compassHeading,
    courseHeading,
    motionState,
    nextLocation,
}) {
    const activeCourseHeading = motionState.isMoving ? courseHeading : null;

    return {
        ...nextLocation,
        ...(motionState.speed !== null ? { speed: motionState.speed } : {}),
        isMoving: motionState.isMoving,
        ...(activeCourseHeading !== null
            ? {
                  courseHeading: activeCourseHeading,
                  heading: activeCourseHeading,
              }
            : {}),
        ...(compassHeading !== null ? { compassHeading } : {}),
    };
}
