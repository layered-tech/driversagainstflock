export function getAutoPlayAlertSurfaceVisibility({
    isRootMapSurface,
    policeAlertsVisible,
    surveillanceMarkersVisible,
}) {
    if (!isRootMapSurface) {
        return {
            policeAlertsVisible: false,
            surveillanceMarkersVisible: false,
            upcomingAlertsVisible: false,
        };
    }

    return {
        policeAlertsVisible: policeAlertsVisible === true,
        surveillanceMarkersVisible: surveillanceMarkersVisible === true,
        upcomingAlertsVisible: true,
    };
}
