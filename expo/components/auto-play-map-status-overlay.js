import { View } from 'react-native';
import {
    CurrentRoadPill,
    getCurrentRoadText,
} from './map/current-road-context';
import {
    AUTO_PLAY_LOCATION_PUCK_HEIGHT,
    getCurrentRoadPillTop,
    shouldShowCurrentRoadPill,
} from './map/current-road-pill-layout';
import { MarkerLoadingIndicator } from './map/marker-loading-indicator';
import {
    getRouteCurrentSpeedMps,
    SpeedLimitSign,
    useRouteSpeedLimit,
} from './map/speed-limit';
import { AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE } from './map/speed-limit-layout';

function getCurrentRoadPillPosition({
    followViewportAnchorY,
    viewportMetrics,
}) {
    const visibleRect = viewportMetrics?.visibleRect;
    const viewportWidth = Number(viewportMetrics?.width);
    const visibleLeft = Number(visibleRect?.left);
    const visibleRight = Number(visibleRect?.right);
    const pillTop = getCurrentRoadPillTop({
        locationAnchorY: followViewportAnchorY,
        locationPuckHeight: AUTO_PLAY_LOCATION_PUCK_HEIGHT,
    });

    if (
        pillTop === null ||
        !Number.isFinite(viewportWidth) ||
        !Number.isFinite(visibleLeft) ||
        !Number.isFinite(visibleRight) ||
        visibleRight <= visibleLeft
    ) {
        return null;
    }

    return {
        left: visibleLeft,
        right: Math.max(0, viewportWidth - visibleRight),
        top: pillTop,
    };
}

export function AutoPlayMapStatusOverlay({
    activeDirectionsRoute,
    followViewportAnchorY,
    freeDriveIsActive,
    markerLoader,
    mapPreferencesAreLoaded,
    presentation,
    userLocation,
    viewportMetrics,
}) {
    const routeIsActive = Boolean(activeDirectionsRoute);
    const speedLimit = useRouteSpeedLimit({
        routeIsActive: routeIsActive || freeDriveIsActive,
        userLocation,
    });
    const speedLimitIsVisible = Number.isFinite(
        Number(speedLimit?.speedLimitMph),
    );
    const currentRoadIsVisible = shouldShowCurrentRoadPill({
        roadText: getCurrentRoadText(userLocation),
    });
    const currentRoadPillPosition = getCurrentRoadPillPosition({
        followViewportAnchorY,
        viewportMetrics,
    });
    const currentRoadPillIsVisible =
        currentRoadIsVisible && currentRoadPillPosition !== null;
    const markerLoadingIsVisible =
        mapPreferencesAreLoaded && markerLoader.renderMarkerLoadingIndicator;
    const bottomOffset = speedLimitIsVisible ? 10 : 0;

    if (
        !markerLoadingIsVisible &&
        !speedLimitIsVisible &&
        !currentRoadPillIsVisible
    ) {
        return null;
    }

    return (
        <>
            {currentRoadPillIsVisible ? (
                <View
                    className="absolute items-center px-3"
                    pointerEvents="none"
                    style={currentRoadPillPosition}
                >
                    <CurrentRoadPill
                        className="max-w-full"
                        testID="android-auto-current-road-pill"
                        userLocation={userLocation}
                    />
                </View>
            ) : null}

            {markerLoadingIsVisible || speedLimitIsVisible ? (
                <View
                    className="absolute items-end gap-[12px]"
                    pointerEvents="none"
                    style={{
                        bottom:
                            presentation.mapControlLayoutInsets.bottom +
                            bottomOffset,
                        right: presentation.mapControlLayoutInsets.right,
                    }}
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

                    <SpeedLimitSign
                        currentSpeedMps={getRouteCurrentSpeedMps(userLocation)}
                        currentSpeedVisible
                        isDarkMode={presentation.isDarkMapLayer}
                        size={AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE}
                        speedLimit={speedLimit}
                        testID="android-auto-speed-limit-sign"
                        valueTestID="android-auto-speed-limit-value"
                    />
                </View>
            ) : null}
        </>
    );
}
