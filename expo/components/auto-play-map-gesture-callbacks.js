export function getAutoPlayMapGestureCallbacks({
    onPanningInterfaceChanged,
    onPan,
    onZoomGesture,
}) {
    return {
        onDidChangePanningInterface: onPanningInterfaceChanged,
        onDidPan: onPan,
        onDidUpdateZoomGestureWithCenter: onZoomGesture,
    };
}
