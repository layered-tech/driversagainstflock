export function getSharedMapLocationKey(location) {
    if (!location) {
        return '';
    }

    const roadContext = location.roadMatch?.roadContext;
    const speedLimit = location.roadMatch?.speedLimit;
    const roadComponents = Array.isArray(roadContext?.components)
        ? roadContext.components
              .map((component) => component?.text)
              .filter((text) => typeof text === 'string')
        : [];

    return [
        location.latitude,
        location.longitude,
        location.accuracy,
        location.recordedAt,
        location.speed,
        location.courseHeading,
        location.compassHeading,
        location.isMoving,
        location.locationProvider,
        location.roadMatch?.edgeId,
        location.roadMatch?.wayId,
        location.roadMatch?.isOffRoad,
        roadContext?.primaryText,
        roadContext?.isOffRoad,
        roadComponents.join('|'),
        speedLimit?.speedLimitMph,
        speedLimit?.speed,
        speedLimit?.maxspeed,
        speedLimit?.unit,
    ]
        .map((value) => {
            if (typeof value === 'boolean') {
                return value ? 'true' : 'false';
            }

            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }

            return typeof value === 'string' ? value : '';
        })
        .join(',');
}
