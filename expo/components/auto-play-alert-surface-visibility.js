/**
 * Decides which alert layers a car map surface may show. The root in-car map
 * and the CarPlay Dashboard both act as the driver's primary map, so they keep
 * the configured ALPR markers, police nodes, and upcoming alerts. The Android
 * Auto instrument cluster keeps passive ALPR nodes but stays quiet.
 */
export function getAutoPlayAlertSurfaceVisibility({
    isDashboardMapSurface = false,
    isClusterMapSurface = false,
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
            surveillanceMarkersVisible:
                isClusterMapSurface && surveillanceMarkersVisible === true,
            upcomingAlertsVisible: false,
        };
    }

    return {
        policeAlertsVisible: policeAlertsVisible === true,
        surveillanceMarkersVisible: surveillanceMarkersVisible === true,
        upcomingAlertsVisible: true,
    };
}
