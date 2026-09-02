/**
 * Decides which alert layers a car map surface may show. The root in-car map
 * and the CarPlay Dashboard both act as the driver's primary map, so they keep
 * the configured ALPR markers, police nodes, and upcoming alerts. The Android
 * Auto instrument cluster is a glanceable secondary view and stays quiet.
 */
export function getAutoPlayAlertSurfaceVisibility({
    isDashboardMapSurface = false,
    isRootMapSurface,
    policeAlertsVisible,
    surveillanceMarkersVisible,
}) {
    const surfaceShowsAlerts = Boolean(
        isRootMapSurface || isDashboardMapSurface,
    );

    if (!surfaceShowsAlerts) {
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
