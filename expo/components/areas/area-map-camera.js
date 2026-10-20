export function areaCameraSettings({
    bounds,
    center,
    fitGeometry = true,
    zoomLevel = 12,
}) {
    if (bounds && fitGeometry) {
        return {
            bounds: {
                ne: [bounds[2], bounds[3]],
                sw: [bounds[0], bounds[1]],
                paddingTop: 40,
                paddingBottom: 40,
                paddingLeft: 40,
                paddingRight: 40,
            },
        };
    }
    return {
        centerCoordinate: center ?? [-98.5, 39.5],
        zoomLevel: center ? zoomLevel : 3,
    };
}
