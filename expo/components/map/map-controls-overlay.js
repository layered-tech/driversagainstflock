import { ActivityIndicator, View } from 'react-native';
import { ContributeEntryButton } from '../contribute/contribute-entry-button';
import { Icon } from '../design-system/icon';
import { MAP_CONTROL_BUTTON_CLASS_NAME, ZOOM_STEP } from './constants';
import { MapControlButton } from './map-control-button';
import { MapLayerButton } from './map-layer-controls';
import { useMapControlsContext } from './map-screen-context';
import { MarkerLoadingIndicator } from './marker-loading-indicator';

export function MapControlsOverlay({
    showFreeDriveButton = true,
    showContributeEntryButton = true,
}) {
    const {
        defaultMapControlClassName,
        defaultMapControlGlassTintColor,
        defaultMapControlIconColor,
        drivingRecenterButtonClassName,
        drivingRecenterButtonGlassTintColor,
        drivingRecenterIconColor,
        drivingRecenterIsVisible,
        freeDriveIsActive,
        handleDrivingRecenterPress,
        handleLocationTrackingPress,
        handleMarkerLoadingIndicatorHidden,
        handleStartFreeDrive,
        handleStopFreeDrive,
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

            {showFreeDriveButton ? (
                <MapControlButton
                    accessibilityLabel={
                        freeDriveIsActive
                            ? 'Exit free drive'
                            : 'Start free drive'
                    }
                    accessibilityRole="button"
                    className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${
                        freeDriveIsActive
                            ? 'dark:bg-daf-surface-dark border-daf-alert bg-white'
                            : defaultMapControlClassName
                    }`}
                    glassTintColor={
                        freeDriveIsActive
                            ? 'rgba(255,220,220,0.78)'
                            : defaultMapControlGlassTintColor
                    }
                    onPress={
                        freeDriveIsActive
                            ? handleStopFreeDrive
                            : handleStartFreeDrive
                    }
                    testID={
                        freeDriveIsActive
                            ? 'exit-free-drive-button'
                            : 'start-free-drive-button'
                    }
                >
                    <View className="-translate-x-px translate-y-px">
                        <Icon
                            color={
                                freeDriveIsActive
                                    ? '#FF4D4F'
                                    : defaultMapControlIconColor
                            }
                            name={freeDriveIsActive ? 'x' : 'navigation'}
                            size={21}
                        />
                    </View>
                </MapControlButton>
            ) : null}

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

            {showContributeEntryButton ? <ContributeEntryButton /> : null}

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
