export function resolveDrivingMotionState({
    derivedMotion,
    fallbackCourseHeading,
    locationCourseHeading,
    measuredSpeed,
    minimumCourseSpeed,
    preferDerivedMotion = false,
}) {
    const derivedMovementIsUsable =
        preferDerivedMotion &&
        derivedMotion.courseHeading !== null &&
        derivedMotion.speed !== null &&
        derivedMotion.speed >= minimumCourseSpeed;
    const speed = derivedMovementIsUsable
        ? Math.max(measuredSpeed ?? 0, derivedMotion.speed)
        : (measuredSpeed ?? derivedMotion.speed);
    const measuredCourseHeading =
        locationCourseHeading ?? derivedMotion.courseHeading;
    const courseHeading =
        measuredCourseHeading ??
        (speed !== null && speed >= minimumCourseSpeed
            ? fallbackCourseHeading
            : null);
    const isMoving =
        courseHeading !== null &&
        (speed !== null
            ? speed >= minimumCourseSpeed
            : measuredCourseHeading !== null);

    return {
        courseHeading: isMoving ? courseHeading : null,
        isMoving,
        speed,
    };
}
