import { ActivityIndicator, Text, View } from 'react-native';
import {
    getAutoPlaySpeedLimitOverlayLayout,
    getAutoPlayTopRightStatusOverlayLayout,
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

function AutoPlayRouteLoadingCard({ routeLoading }) {
    const destinationLabel = String(routeLoading.destinationLabel ?? '').trim();
    const loadingText = destinationLabel
        ? `Finding route to ${destinationLabel}`
        : 'Finding route';

    return (
        <View
            accessibilityLabel={loadingText}
            accessibilityRole="progressbar"
            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 max-w-[360px] flex-row items-center gap-3 rounded-dafPill border border-daf-border-glass bg-white/95 px-5 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.22)]"
            testID="auto-play-route-loading-card"
        >
            <ActivityIndicator color={dafSemanticColors.brand} size="small" />
            <Text
                className="min-w-0 flex-shrink text-[15px] font-semibold leading-[19px] text-daf-text-primary dark:text-white"
                numberOfLines={2}
            >
                {loadingText}
            </Text>
        </View>
    );
}

function AutoPlaySingleResultCountdownCard({ countdown }) {
    const destinationLabel = String(countdown.destinationLabel ?? '').trim();
    const remainingSeconds = Math.max(
        1,
        Math.round(Number(countdown.remainingSeconds) || 1),
    );
    const accessibilityLabel = destinationLabel
        ? `Opening route options for ${destinationLabel} in ${remainingSeconds} seconds.`
        : `Opening route options in ${remainingSeconds} seconds.`;

    return (
        <View
            accessibilityLabel={accessibilityLabel}
            accessibilityLiveRegion="polite"
            accessibilityRole="timer"
            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 max-w-[360px] flex-row items-center gap-3 rounded-dafMd border border-daf-border-glass bg-white/95 px-4 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.22)]"
            testID="auto-play-single-result-countdown-card"
        >
            <View className="bg-daf-azure/15 dark:bg-daf-azure/20 h-10 w-10 items-center justify-center rounded-full">
                <Text className="font-dafMono text-[19px] font-extrabold leading-[22px] text-daf-azure dark:text-blue-300">
                    {remainingSeconds}
                </Text>
            </View>
            <View className="min-w-0 flex-shrink gap-0.5">
                <Text
                    className="text-[14px] font-semibold leading-[18px] text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    Route options in {remainingSeconds}s
                </Text>
                {destinationLabel ? (
                    <Text
                        className="text-[12px] leading-[16px] text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                    >
                        {destinationLabel}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

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

export function AutoPlayTopRightStatusOverlay({
    mapControlLayoutInsets,
    routeLoading,
    singleResultCountdown,
    upcomingAlerts,
}) {
    const upcomingAlert = Array.isArray(upcomingAlerts)
        ? upcomingAlerts[0]
        : null;

    if (!upcomingAlert && !routeLoading && !singleResultCountdown) {
        return null;
    }

    const layout = getAutoPlayTopRightStatusOverlayLayout({
        mapControlLayoutInsets,
    });

    return (
        <View
            className="absolute items-end gap-[12px]"
            pointerEvents="none"
            style={layout.positionStyle}
            testID="auto-play-top-right-status-overlay"
        >
            {upcomingAlert ? (
                <AutoPlayUpcomingAlert alert={upcomingAlert} />
            ) : null}
            {singleResultCountdown ? (
                <AutoPlaySingleResultCountdownCard
                    countdown={singleResultCountdown}
                />
            ) : null}
            {routeLoading ? (
                <AutoPlayRouteLoadingCard routeLoading={routeLoading} />
            ) : null}
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
    const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
        mapControlLayoutInsets: presentation.mapControlLayoutInsets,
        size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
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
