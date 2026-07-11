import { ActivityIndicator, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { MAP_CONTROL_BUTTON_CLASS_NAME, ZOOM_STEP } from './constants';
import { MapControlButton } from './map-control-button';
import { MapLayerButton } from './map-layer-controls';
import { useMapControlsContext } from './map-screen-context';
import { MarkerLoadingIndicator } from './marker-loading-indicator';

export function MapControlsOverlay() {
    const {
        defaultMapControlClassName,
        defaultMapControlGlassTintColor,
        defaultMapControlIconColor,
        drivingRecenterButtonClassName,
        drivingRecenterButtonGlassTintColor,
        drivingRecenterIconColor,
        drivingRecenterIsVisible,
        handleDrivingRecenterPress,
        handleLocationTrackingPress,
        handleMarkerLoadingIndicatorHidden,
        handleZoomPress,
        isLocating,
        locatingIndicatorColor,
        mapPreferencesAreLoaded,
        markerLoadError,
        markerLoadingIndicatorIsVisible,
        renderMarkerLoadingIndicator,
        trackingButtonAccessibilityLabel,
        trackingButtonClassName,
        trackingButtonGlassTintColor,
        trackingIconColor,
    } = useMapControlsContext();
    const userLocationButtonAccessibilityHint = drivingRecenterIsVisible
        ? 'Recenters the driving map without turning off follow mode.'
        : undefined;
    const userLocationButtonAccessibilityLabel = drivingRecenterIsVisible
        ? 'Recenter on your location'
        : trackingButtonAccessibilityLabel;
    const userLocationButtonClassName = drivingRecenterIsVisible
        ? drivingRecenterButtonClassName
        : trackingButtonClassName;
    const userLocationButtonGlassTintColor = drivingRecenterIsVisible
        ? drivingRecenterButtonGlassTintColor
        : trackingButtonGlassTintColor;
    const userLocationButtonIconColor = drivingRecenterIsVisible
        ? drivingRecenterIconColor
        : trackingIconColor;
    const userLocationButtonIndicatorColor = drivingRecenterIsVisible
        ? drivingRecenterIconColor
        : locatingIndicatorColor;
    const handleUserLocationPress = drivingRecenterIsVisible
        ? handleDrivingRecenterPress
        : handleLocationTrackingPress;

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <View
            className="items-center gap-3"
            pointerEvents="box-none"
            testID="map-control-rail"
        >
            <MapLayerButton />

            <MapControlButton
                accessibilityLabel="Zoom in"
                accessibilityRole="button"
                className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`}
                glassTintColor={defaultMapControlGlassTintColor}
                onPress={() => handleZoomPress(ZOOM_STEP)}
            >
                <Icon
                    color={defaultMapControlIconColor}
                    name="plus"
                    size={22}
                />
            </MapControlButton>

            <MapControlButton
                accessibilityLabel="Zoom out"
                accessibilityRole="button"
                className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`}
                glassTintColor={defaultMapControlGlassTintColor}
                onPress={() => handleZoomPress(-ZOOM_STEP)}
            >
                <Icon
                    color={defaultMapControlIconColor}
                    name="minus"
                    size={22}
                />
            </MapControlButton>

            <MapControlButton
                accessibilityHint={userLocationButtonAccessibilityHint}
                accessibilityLabel={userLocationButtonAccessibilityLabel}
                accessibilityRole="button"
                className={userLocationButtonClassName}
                disabled={isLocating}
                glassTintColor={userLocationButtonGlassTintColor}
                onPress={handleUserLocationPress}
                testID={
                    drivingRecenterIsVisible
                        ? 'driving-recenter-button'
                        : 'map-user-location-button'
                }
            >
                {isLocating ? (
                    <ActivityIndicator
                        color={userLocationButtonIndicatorColor}
                        size="small"
                    />
                ) : (
                    <View className="h-6 w-6 items-center justify-center">
                        <Icon
                            color={userLocationButtonIconColor}
                            name="locate-fixed"
                            size={20}
                        />
                    </View>
                )}
            </MapControlButton>

            {renderMarkerLoadingIndicator ? (
                <MarkerLoadingIndicator
                    accessibilityLabel={
                        markerLoadError || 'Loading map markers'
                    }
                    isVisible={markerLoadingIndicatorIsVisible}
                    onHidden={handleMarkerLoadingIndicatorHidden}
                />
            ) : null}
        </View>
    );
}
