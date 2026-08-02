import { useMemo } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import {
    getAutoPlayCurrentRoadPillLayout,
    getAutoPlaySpeedLimitOverlayLayout,
    getAutoPlayTopRightStatusOverlayLayout,
} from './auto-play-map-status-layout';
import { Icon } from './design-system/icon';
import { dafSemanticColors } from './design-system/tokens';
import { getDrivingAlertsPresentation } from './map/driving-alerts';
import { DrivingLocationRoadStack } from './map/driving-location-road-stack';
import { MarkerLoadingIndicator } from './map/marker-loading-indicator';
import { AUTO_PLAY_NAVIGATION_PUCK_SIZE } from './map/navigation-puck-layout';
import {
    getCurrentSpeedMph,
    getRouteCurrentSpeedMps,
    SpeedLimitSign,
    useRouteSpeedLimit,
} from './map/speed-limit';
import { AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE } from './map/speed-limit-layout';
import { UpcomingAlertDistanceTrack } from './map/upcoming-alert-distance-track';

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

function AutoPlayAlertIcon({ alertPresentation, compact = false }) {
    return (
        <View
            className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} items-center justify-center rounded-dafSm ${alertPresentation.iconBackgroundClassName}`}
        >
            <Icon
                color={alertPresentation.accentColor}
                name={alertPresentation.icon}
                size={compact ? 15 : 18}
            />
        </View>
    );
}

function AutoPlayAlertSource({ alertPresentation }) {
    return (
        <Text
            className="text-[11px] leading-[13px] text-daf-text-tertiary dark:text-neutral-400"
            numberOfLines={1}
        >
            {alertPresentation.subtitle}
        </Text>
    );
}

function AutoPlaySingleUpcomingAlert({ presentation }) {
    const alertPresentation = presentation.alerts[0];

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark relative w-[250px] gap-1.5 overflow-hidden rounded-dafMd border border-daf-border bg-daf-surface-card px-2.5 pb-2.5 pt-2.5 shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="auto-play-upcoming-alert"
        >
            <View className="flex-row items-center gap-2">
                <AutoPlayAlertIcon alertPresentation={alertPresentation} />
                <View className="min-w-0 flex-1">
                    <Text
                        className="text-[14px] font-semibold leading-4 text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                    >
                        {alertPresentation.title}
                    </Text>
                    <AutoPlayAlertSource
                        alertPresentation={alertPresentation}
                    />
                </View>
                <Text
                    className="font-dafMono text-[18px] font-extrabold leading-[18px]"
                    numberOfLines={1}
                    style={{ color: alertPresentation.accentColor }}
                >
                    {alertPresentation.distance}
                </Text>
            </View>
            <View>
                <UpcomingAlertDistanceTrack
                    accentColor={alertPresentation.accentColor}
                    compact
                    progress={alertPresentation.approachProgress}
                    testID="auto-play-upcoming-alert-track"
                />
            </View>
        </View>
    );
}

function AutoPlayCombinedAlertColumn({ alertPresentation, testID }) {
    return (
        <View
            className={`${alertPresentation.type === 'police' ? 'pr-3.5' : 'pl-3.5 pr-2.5'} min-w-0 flex-1 gap-1.5 pb-2.5 pt-2.5 ${alertPresentation.type === 'police' ? 'pl-2.5' : ''}`}
            testID={testID}
        >
            <View
                className={`min-w-0 flex-row items-center gap-1.5 ${alertPresentation.type === 'alpr' ? 'pr-5' : ''}`}
            >
                <AutoPlayAlertIcon
                    alertPresentation={alertPresentation}
                    compact
                />
                <Text
                    className="min-w-0 flex-1 text-xs font-semibold leading-[14px] text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {alertPresentation.title}
                </Text>
            </View>
            <Text
                className="font-dafMono text-[17px] font-extrabold leading-[17px]"
                numberOfLines={1}
                style={{ color: alertPresentation.accentColor }}
            >
                {alertPresentation.distance}
            </Text>
            <UpcomingAlertDistanceTrack
                accentColor={alertPresentation.accentColor}
                compact
                progress={alertPresentation.approachProgress}
                testID={`${testID}-track`}
            />
            <AutoPlayAlertSource alertPresentation={alertPresentation} />
        </View>
    );
}

function AutoPlayCombinedUpcomingAlerts({ presentation }) {
    const [policeAlert, alprAlert] = presentation.alerts;

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark relative w-[250px] flex-row overflow-hidden rounded-dafMd border border-daf-border bg-daf-surface-card shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="auto-play-upcoming-alert"
        >
            <View
                className="dark:bg-daf-border-dark absolute left-1/2 top-[-25%] h-[150%] w-px rotate-[11deg] bg-daf-border"
                pointerEvents="none"
            />
            <AutoPlayCombinedAlertColumn
                alertPresentation={policeAlert}
                testID="auto-play-upcoming-alert-police"
            />
            <AutoPlayCombinedAlertColumn
                alertPresentation={alprAlert}
                testID="auto-play-upcoming-alert-alpr"
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
    const presentation = useMemo(
        () => getDrivingAlertsPresentation(upcomingAlerts),
        [upcomingAlerts],
    );

    if (!presentation && !routeLoading && !singleResultCountdown) {
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
            {presentation?.variant === 'combined' ? (
                <AutoPlayCombinedUpcomingAlerts presentation={presentation} />
            ) : presentation ? (
                <AutoPlaySingleUpcomingAlert presentation={presentation} />
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
    currentRoadPill,
    drivingStatusIsVisible = true,
    freeDriveIsActive,
    markerLoader,
    mapPreferencesAreLoaded,
    navigationPuckSize = AUTO_PLAY_NAVIGATION_PUCK_SIZE,
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
    const currentSpeedMps = getRouteCurrentSpeedMps(userLocation);
    const currentSpeedMph = getCurrentSpeedMph(currentSpeedMps);
    const currentSpeedIsVisible = Boolean(
        drivingStatusIsVisible && Number.isFinite(Number(currentSpeedMps)),
    );
    const currentSpeedWithoutLimitIsVisible = Boolean(
        Platform.OS === 'android' &&
        drivingStatusIsVisible &&
        currentSpeedMph > 0,
    );
    const speedStatusIsVisible =
        speedLimitIsVisible || currentSpeedWithoutLimitIsVisible;
    const markerLoadingIsVisible =
        mapPreferencesAreLoaded && markerLoader.renderMarkerLoadingIndicator;
    const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
        mapControlLayoutInsets: presentation.mapControlLayoutInsets,
        size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
    });
    const currentRoadPillLayout = currentRoadPill?.reserveSpeedLimitSpace
        ? getAutoPlayCurrentRoadPillLayout({
              mapControlLayoutInsets: presentation.mapControlLayoutInsets,
              size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
              viewportMetrics,
          })
        : null;
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
                        currentRoadPillStyle={
                            currentRoadPillLayout?.maximumWidth === undefined
                                ? undefined
                                : {
                                      maxWidth:
                                          currentRoadPillLayout.maximumWidth,
                                  }
                        }
                        currentRoadPillTextStyle={currentRoadPill?.textStyle}
                        onLocationAnchorLayout={onLocationAnchorLayout}
                        puckSize={navigationPuckSize}
                        userLocation={userLocation}
                    />
                </View>
            ) : null}

            {markerLoadingIsVisible || speedStatusIsVisible ? (
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

                    {speedStatusIsVisible ? (
                        <View
                            style={speedLimitOverlayLayout.alignmentFrameStyle}
                        >
                            <SpeedLimitSign
                                currentSpeedMps={currentSpeedMps}
                                currentSpeedVisible={currentSpeedIsVisible}
                                currentSpeedWithoutLimitVisible={
                                    currentSpeedWithoutLimitIsVisible
                                }
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
