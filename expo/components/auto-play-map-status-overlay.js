import {
    ActivityIndicator,
    Platform,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import {
    getAutoPlayCurrentRoadPillLayout,
    getAutoPlaySpeedLimitBadgeSize,
    getAutoPlaySpeedLimitOverlayLayout,
    getAutoPlayTopRightStatusOverlayLayout,
} from './auto-play-map-status-layout';
import { dafSemanticColors } from './design-system/tokens';
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

function AutoPlayRouteLoadingCard({ isDarkMode, routeLoading }) {
    const destinationLabel = String(routeLoading.destinationLabel ?? '').trim();
    const loadingText = destinationLabel
        ? `Finding route to ${destinationLabel}`
        : 'Finding route';

    return (
        <View
            accessibilityLabel={loadingText}
            accessibilityRole="progressbar"
            className={`${isDarkMode ? 'border-daf-border-glass-dark bg-daf-surface-dark/95' : 'border-daf-border-glass bg-white/95'} max-w-[360px] flex-row items-center gap-3 rounded-dafPill border px-5 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.22)]`}
            testID="auto-play-route-loading-card"
        >
            <ActivityIndicator color={dafSemanticColors.brand} size="small" />
            <Text
                className={`min-w-0 flex-shrink text-[15px] font-semibold leading-[19px] ${isDarkMode ? 'text-white' : 'text-daf-text-primary'}`}
                numberOfLines={2}
            >
                {loadingText}
            </Text>
        </View>
    );
}

function AutoPlaySingleResultCountdownCard({ countdown, isDarkMode }) {
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
            className={`${isDarkMode ? 'border-daf-border-glass-dark bg-daf-surface-dark/95' : 'border-daf-border-glass bg-white/95'} max-w-[360px] flex-row items-center gap-3 rounded-dafMd border px-4 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.22)]`}
            testID="auto-play-single-result-countdown-card"
        >
            <View
                className={`${isDarkMode ? 'bg-daf-azure/20' : 'bg-daf-azure/15'} h-10 w-10 items-center justify-center rounded-full`}
            >
                <Text
                    className={`font-dafMono text-[19px] font-extrabold leading-[22px] ${isDarkMode ? 'text-blue-300' : 'text-daf-azure'}`}
                >
                    {remainingSeconds}
                </Text>
            </View>
            <View className="min-w-0 flex-shrink gap-0.5">
                <Text
                    className={`text-[14px] font-semibold leading-[18px] ${isDarkMode ? 'text-white' : 'text-daf-text-primary'}`}
                    numberOfLines={1}
                >
                    Route options in {remainingSeconds}s
                </Text>
                {destinationLabel ? (
                    <Text
                        className={`text-[12px] leading-[16px] ${isDarkMode ? 'text-neutral-400' : 'text-daf-text-tertiary'}`}
                        numberOfLines={1}
                    >
                        {destinationLabel}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

export function AutoPlayTopRightStatusOverlay({
    isDarkMode,
    mapControlLayoutInsets,
    routeLoading,
    singleResultCountdown,
}) {
    const systemColorScheme = useColorScheme();
    const resolvedIsDarkMode = isDarkMode ?? systemColorScheme === 'dark';

    if (!routeLoading && !singleResultCountdown) {
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
            {singleResultCountdown ? (
                <AutoPlaySingleResultCountdownCard
                    countdown={singleResultCountdown}
                    isDarkMode={resolvedIsDarkMode}
                />
            ) : null}
            {routeLoading ? (
                <AutoPlayRouteLoadingCard
                    isDarkMode={resolvedIsDarkMode}
                    routeLoading={routeLoading}
                />
            ) : null}
        </View>
    );
}

export function AutoPlayMapStatusOverlay({
    activeDirectionsRoute,
    currentRoadPill,
    drivingStatusIsVisible = true,
    freeDriveIsActive,
    isDarkMode,
    markerLoader,
    mapPreferencesAreLoaded,
    navigationPuckSize = AUTO_PLAY_NAVIGATION_PUCK_SIZE,
    onLocationAnchorLayout,
    presentation,
    rendersSpeedLimit = true,
    speedLimitBadge,
    userLocation,
    viewportMetrics,
}) {
    const systemColorScheme = useColorScheme();
    const resolvedIsDarkMode = isDarkMode ?? systemColorScheme === 'dark';
    const routeIsActive = Boolean(activeDirectionsRoute);
    const speedLimit = useRouteSpeedLimit({
        routeIsActive:
            rendersSpeedLimit && (routeIsActive || freeDriveIsActive),
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
        rendersSpeedLimit &&
        Platform.OS === 'android' &&
        drivingStatusIsVisible &&
        currentSpeedMph > 0,
    );
    const markerLoadingIsVisible =
        mapPreferencesAreLoaded && markerLoader.renderMarkerLoadingIndicator;
    const speedStatusIsVisible =
        speedLimitIsVisible || currentSpeedWithoutLimitIsVisible;
    const speedLimitBadgeSize = getAutoPlaySpeedLimitBadgeSize({
        portraitSize: speedLimitBadge?.portraitSize,
        size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
        viewportMetrics,
    });
    const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
        mapControlLayoutInsets: presentation.mapControlLayoutInsets,
        size: speedLimitBadgeSize,
    });
    const currentRoadPillLayout =
        rendersSpeedLimit &&
        speedStatusIsVisible &&
        currentRoadPill?.reserveSpeedLimitSpace
            ? getAutoPlayCurrentRoadPillLayout({
                  gap: currentRoadPill.speedLimitGap,
                  mapControlLayoutInsets: presentation.mapControlLayoutInsets,
                  size: speedLimitBadgeSize,
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
                        currentRoadPillIsDarkMode={resolvedIsDarkMode}
                        currentRoadPillTestID="android-auto-current-road-pill"
                        currentRoadPillStyle={
                            currentRoadPillLayout?.maximumWidth === undefined
                                ? undefined
                                : {
                                      maxWidth:
                                          currentRoadPillLayout.maximumWidth,
                                  }
                        }
                        currentRoadPillTextStyle={
                            rendersSpeedLimit
                                ? (currentRoadPill?.speedLimitAdjacentTextStyle ??
                                  currentRoadPill?.textStyle)
                                : currentRoadPill?.textStyle
                        }
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
                                isDarkMode={resolvedIsDarkMode}
                                size={speedLimitBadgeSize}
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
