import { View } from 'react-native';
import {
    CurrentRoadPill,
    getCurrentRoadText,
} from './map/current-road-context';
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
    presentation,
    userLocation,
}) {
    const routeIsActive = Boolean(activeDirectionsRoute);
    const speedLimit = useRouteSpeedLimit({
        routeIsActive: routeIsActive || freeDriveIsActive,
        userLocation,
    });
    const speedLimitIsVisible = Number.isFinite(
        Number(speedLimit?.speedLimitMph),
    );
    const currentRoadIsVisible =
        !routeIsActive && Boolean(getCurrentRoadText(userLocation));
    const markerLoadingIsVisible =
        mapPreferencesAreLoaded && markerLoader.renderMarkerLoadingIndicator;
    const bottomOffset = speedLimitIsVisible ? 10 : 0;

    if (
        !markerLoadingIsVisible &&
        !speedLimitIsVisible &&
        !currentRoadIsVisible
    ) {
        return null;
    }

    return (
        <View
            className="absolute items-end gap-[12px]"
            pointerEvents="none"
            style={{
                bottom:
                    presentation.mapControlLayoutInsets.bottom + bottomOffset,
                right: presentation.mapControlLayoutInsets.right,
            }}
        >
            {markerLoadingIsVisible ? (
                <MarkerLoadingIndicator
                    accessibilityLabel={
                        markerLoader.markerLoadError || 'Loading map markers'
                    }
                    isVisible={markerLoader.markerLoadingIndicatorIsVisible}
                    onHidden={markerLoader.handleMarkerLoadingIndicatorHidden}
                />
            ) : null}

            {currentRoadIsVisible ? (
                <CurrentRoadPill
                    className="max-w-[260px]"
                    testID="android-auto-current-road-pill"
                    userLocation={userLocation}
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
    );
}
