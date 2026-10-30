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

function AutoPlaySearchLoadingCard({ isDarkMode, searchLoading }) {
    const destinationLabel = String(searchLoading.query ?? '').trim();
    const loadingText = `Searching for ${destinationLabel}`;

    return (
        <View
            accessibilityLabel={loadingText}
            accessibilityRole="progressbar"
            className={`${isDarkMode ? 'border-daf-border-glass-dark bg-daf-surface-dark/95' : 'border-daf-border-glass bg-white/95'} max-w-[360px] flex-row items-center gap-2 rounded-dafPill border px-3 py-2`}
            testID="auto-play-search-loading-card"
        >
            <ActivityIndicator color={dafSemanticColors.brand} size="small" />
            <Text
                className={`min-w-0 flex-shrink text-[14px] font-medium leading-[18px] ${isDarkMode ? 'text-white' : 'text-daf-text-primary'}`}
                numberOfLines={2}
            >
                {loadingText}
            </Text>
        </View>
    );
}

export function AutoPlayTopRightStatusOverlay({
    isDarkMode,
    mapControlLayoutInsets,
    searchLoading,
}) {
    const systemColorScheme = useColorScheme();
    const resolvedIsDarkMode = isDarkMode ?? systemColorScheme === 'dark';

    if (!searchLoading) {
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
            <AutoPlaySearchLoadingCard
                isDarkMode={resolvedIsDarkMode}
                searchLoading={searchLoading}
            />
        </View>
    );
}

/**
 * Draws the app-owned map chrome and, just as importantly, the invisible puck
 * slot the follow camera measures its anchor from.
 *
 * `statusChromeIsVisible` is what a host-owned secondary surface (the CarPlay
 * Dashboard, either instrument cluster) turns off. Those surfaces still follow
 * the driver, so they still need the measured anchor — without it the camera
 * falls back to centring the puck in the viewport.
 *
 * `rendersSpeedLimit` arrives already resolved by the surface, so the speed
 * badge can outlive the rest of the chrome. The CarPlay Dashboard keeps both
 * the badge and current road pill while leaving the loading indicator off.
 * Cluster surfaces can also show the road pill independently.
 */
export function AutoPlayMapStatusOverlay({
    confirmationIsActive = false,
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
    statusChromeIsVisible = true,
    currentRoadPillIsVisible = statusChromeIsVisible,
    userLocation,
    viewportMetrics,
}) {
    const systemColorScheme = useColorScheme();
    const resolvedIsDarkMode = isDarkMode ?? systemColorScheme === 'dark';
    const routeIsActive = Boolean(activeDirectionsRoute);
    const speedLimitIsRendered = Boolean(rendersSpeedLimit);
    const speedLimit = useRouteSpeedLimit({
        routeIsActive:
            speedLimitIsRendered && (routeIsActive || freeDriveIsActive),
        userLocation,
    });
    const speedLimitIsVisible = Boolean(
        drivingStatusIsVisible &&
        speedLimitIsRendered &&
        Number.isFinite(Number(speedLimit?.speedLimitMph)),
    );
    const currentSpeedMps = getRouteCurrentSpeedMps(userLocation);
    const currentSpeedMph = getCurrentSpeedMph(currentSpeedMps);
    const currentSpeedIsVisible = Boolean(
        drivingStatusIsVisible && Number.isFinite(Number(currentSpeedMps)),
    );
    // Both car hosts leave the map canvas to the app, so the speed dial stands
    // in for the badge wherever the road has no mapped limit. The handset keeps
    // the badge hidden there because its dial shares the row with the maneuver
    // card, which the car hosts draw in their own chrome instead.
    const currentSpeedWithoutLimitIsVisible = Boolean(
        speedLimitIsRendered && drivingStatusIsVisible && currentSpeedMph > 0,
    );
    const markerLoadingIsVisible = Boolean(
        statusChromeIsVisible &&
        mapPreferencesAreLoaded &&
        markerLoader.renderMarkerLoadingIndicator,
    );
    const speedStatusIsVisible =
        !confirmationIsActive &&
        (speedLimitIsVisible || currentSpeedWithoutLimitIsVisible);
    const speedLimitBadgeSize = getAutoPlaySpeedLimitBadgeSize({
        portraitSize: speedLimitBadge?.portraitSize,
        size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
        viewportMetrics,
    });
    const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
        platform: Platform.OS,
        mapControlLayoutInsets: presentation.mapControlLayoutInsets,
        size: speedLimitBadgeSize,
    });
    const currentRoadPillLayout =
        speedLimitIsRendered &&
        speedStatusIsVisible &&
        currentRoadPill?.reserveSpeedLimitSpace
            ? getAutoPlayCurrentRoadPillLayout({
                  platform: Platform.OS,
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
                        currentRoadPillIsCompact={
                            currentRoadPill?.compact === true
                        }
                        currentRoadPillIsDarkMode={resolvedIsDarkMode}
                        currentRoadPillIsVisible={
                            currentRoadPillIsVisible && !confirmationIsActive
                        }
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
                            speedLimitIsRendered
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
