export function areaCameraSettings({
    bounds,
    center,
    fitGeometry = true,
    zoomLevel = 12,
    insets = { left: 0, right: 0 },
    bottomInset = 0,
}) {
    if (bounds && fitGeometry) {
        return {
            bounds: {
                ne: [bounds[2], bounds[3]],
                sw: [bounds[0], bounds[1]],
                paddingTop: 40,
                paddingBottom: 40 + bottomInset,
                paddingLeft: 40 + (insets.left ?? 0),
                paddingRight: 40 + (insets.right ?? 0),
            },
        };
    }
    return {
        centerCoordinate: center ?? [-98.5, 39.5],
        zoomLevel: center ? zoomLevel : 3,
        ...(insets.left || insets.right || bottomInset
            ? {
                  padding: {
                      paddingTop: 0,
                      paddingBottom: bottomInset,
                      paddingLeft: insets.left ?? 0,
                      paddingRight: insets.right ?? 0,
                  },
              }
            : {}),
    };
}
