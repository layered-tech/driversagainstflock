import { View } from 'react-native';
import { DrivingLocationRoadStack } from './map/driving-location-road-stack';
import { MarkerLoadingIndicator } from './map/marker-loading-indicator';
import {
    getRouteCurrentSpeedMps,
    SpeedLimitSign,
    useRouteSpeedLimit,
} from './map/speed-limit';
import { AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE } from './map/speed-limit-layout';

export function AutoPlayMapStatusOverlay({
    activeDirectionsRoute,
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
    const speedLimitIsVisible = Number.isFinite(
        Number(speedLimit?.speedLimitMph),
    );
    const markerLoadingIsVisible =
        mapPreferencesAreLoaded && markerLoader.renderMarkerLoadingIndicator;
    const bottomOffset = speedLimitIsVisible ? 10 : 0;

    return (
        <>
            <View
                className="absolute inset-0"
                pointerEvents="box-none"
                style={viewportMetrics.cameraPadding}
            >
                <View className="flex-1" pointerEvents="none" />
                <DrivingLocationRoadStack
                    currentRoadPillTestID="android-auto-current-road-pill"
                    onLocationAnchorLayout={onLocationAnchorLayout}
                    userLocation={userLocation}
                />
            </View>

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
