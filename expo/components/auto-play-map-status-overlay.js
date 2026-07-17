import { Text, View } from 'react-native';
import {
    getAutoPlaySpeedLimitOverlayLayout,
    getAutoPlayUpcomingAlertOverlayLayout,
} from './auto-play-map-status-layout';
import { Icon } from './design-system/icon';
import { dafSemanticColors } from './design-system/tokens';
import { formatUpcomingAlertDistance } from './map/driving-alerts';
import { DrivingLocationRoadStack } from './map/driving-location-road-stack';
import { MarkerLoadingIndicator } from './map/marker-loading-indicator';
import { AUTO_PLAY_NAVIGATION_PUCK_SIZE } from './map/navigation-puck-layout';
import {
    getRouteCurrentSpeedMps,
    SpeedLimitSign,
    useRouteSpeedLimit,
} from './map/speed-limit';
import { AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE } from './map/speed-limit-layout';
import { UpcomingAlertPassTimer } from './map/upcoming-alert-pass-timer';

function AutoPlayUpcomingAlert({ alert }) {
    if (alert?.type !== 'alpr' && alert?.type !== 'police') {
        return null;
    }

    const isPoliceAlert = alert.type === 'police';
    const accentColor = isPoliceAlert
        ? dafSemanticColors.info
        : dafSemanticColors.danger;
    const distance = formatUpcomingAlertDistance(alert.distanceMeters);

    return (
        <View
            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 relative w-[280px] flex-row items-start gap-2.5 overflow-hidden rounded-dafMd border border-daf-border-glass bg-white/95 px-3 py-2.5 shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="auto-play-upcoming-alert"
        >
            <View
                className={`h-9 w-9 items-center justify-center rounded-dafSm ${
                    isPoliceAlert
                        ? 'bg-daf-azure/15 dark:bg-daf-azure/20'
                        : 'bg-daf-alert/15 dark:bg-daf-alert/20'
                }`}
            >
                <Icon
                    color={accentColor}
                    name={isPoliceAlert ? 'shield' : 'camera'}
                    size={20}
                />
            </View>
            <View className="min-w-0 flex-1">
                <View className="flex-row items-baseline gap-1.5">
                    <Text
                        className="flex-1 text-[14px] font-semibold leading-[18px] text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                    >
                        {isPoliceAlert
                            ? 'Police reported ahead'
                            : 'ALPR camera ahead'}
                    </Text>
                    {distance ? (
                        <Text
                            className="font-dafMono text-[13px] font-extrabold"
                            style={{ color: accentColor }}
                        >
                            {distance}
                        </Text>
                    ) : null}
                </View>
                {alert.subtitle ? (
                    <Text
                        className="mt-px text-[11px] leading-[14px] text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                    >
                        {alert.subtitle}
                    </Text>
                ) : null}
            </View>
            <UpcomingAlertPassTimer
                accentColor={accentColor}
                distanceMeters={alert.distanceMeters}
            />
        </View>
    );
}

export function AutoPlayMapStatusOverlay({
    activeDirectionsRoute,
    drivingStatusIsVisible = true,
    freeDriveIsActive,
    markerLoader,
    mapPreferencesAreLoaded,
    onLocationAnchorLayout,
    presentation,
    upcomingAlerts,
    userLocation,
    viewportMetrics,
}) {
    const routeIsActive = Boolean(activeDirectionsRoute);
    const speedLimit = useRouteSpeedLimit({
        routeIsActive: routeIsActive || freeDriveIsActive,
        userLocation,
    });
    const speedLimitIsVisible = Boolean(
        drivingStatusIsVisible &&
        Number.isFinite(Number(speedLimit?.speedLimitMph)),
    );
    const markerLoadingIsVisible =
        mapPreferencesAreLoaded && markerLoader.renderMarkerLoadingIndicator;
    const upcomingAlert = Array.isArray(upcomingAlerts)
        ? upcomingAlerts[0]
        : null;
    const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
        mapControlLayoutInsets: presentation.mapControlLayoutInsets,
        size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
    });
    const upcomingAlertOverlayLayout = getAutoPlayUpcomingAlertOverlayLayout({
        mapControlLayoutInsets: presentation.mapControlLayoutInsets,
    });

    return (
        <>
            {drivingStatusIsVisible ? (
                <View
                    className="absolute inset-0"
                    pointerEvents="box-none"
                    style={viewportMetrics.cameraPadding}
                >
                    <View className="flex-1" pointerEvents="none" />
                    <DrivingLocationRoadStack
                        currentRoadPillTestID="android-auto-current-road-pill"
                        onLocationAnchorLayout={onLocationAnchorLayout}
                        puckSize={AUTO_PLAY_NAVIGATION_PUCK_SIZE}
                        userLocation={userLocation}
                    />
                </View>
            ) : null}

            {upcomingAlert ? (
                <View
                    className="absolute items-end"
                    pointerEvents="none"
                    style={upcomingAlertOverlayLayout.positionStyle}
                >
                    <AutoPlayUpcomingAlert alert={upcomingAlert} />
                </View>
            ) : null}

            {markerLoadingIsVisible || speedLimitIsVisible ? (
                <View
                    className="absolute items-end gap-[12px]"
                    pointerEvents="none"
                    style={speedLimitOverlayLayout.positionStyle}
                >
                    {markerLoadingIsVisible ? (
                        <MarkerLoadingIndicator
                            accessibilityLabel={
                                markerLoader.markerLoadError ||
                                'Loading map markers'
                            }
                            isVisible={
                                markerLoader.markerLoadingIndicatorIsVisible
                            }
                            onHidden={
                                markerLoader.handleMarkerLoadingIndicatorHidden
                            }
                        />
                    ) : null}

                    {speedLimitIsVisible ? (
                        <View
                            style={speedLimitOverlayLayout.alignmentFrameStyle}
                        >
                            <SpeedLimitSign
                                currentSpeedMps={getRouteCurrentSpeedMps(
                                    userLocation,
                                )}
                                currentSpeedVisible
                                isDarkMode={presentation.isDarkMapLayer}
                                size={AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE}
                                speedLimit={speedLimit}
                                testID="android-auto-speed-limit-sign"
                                valueTestID="android-auto-speed-limit-value"
                            />
                        </View>
                    ) : null}
                </View>
            ) : null}
        </>
    );
}
