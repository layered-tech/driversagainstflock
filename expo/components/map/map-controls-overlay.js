import { ActivityIndicator, View } from 'react-native';
import { ContributeEntryButton } from '../contribute/contribute-entry-button';
import { MAP_CONTROL_BUTTON_CLASS_NAME, ZOOM_STEP } from './constants';
import {
    getDrivingMapViewPresentation,
    getNextDrivingMapViewMode,
} from './driving-map-view';
import { MapControlButton } from './map-control-button';
import { MapControlIcon } from './map-control-icon';
import { MapLayerButton } from './map-layer-controls';
import { useMapControlsContext } from './map-screen-context';
import { MarkerLoadingIndicator } from './marker-loading-indicator';

export function MapControlsOverlay({
    onDrawerPress,
    showFreeDriveButton = true,
    showDrawerButton = false,
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
        drivingMapViewControlIsVisible,
        drivingMapViewMode,
        freeDriveIsActive,
        handleDrivingRecenterPress,
        handleDrivingMapViewPress,
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
    const drivingMapViewPresentation =
        getDrivingMapViewPresentation(drivingMapViewMode);
    const nextDrivingMapViewPresentation = getDrivingMapViewPresentation(
        getNextDrivingMapViewMode(drivingMapViewMode),
    );

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <View
            className="items-center gap-3"
            pointerEvents="box-none"
            testID="map-control-rail"
        >
            {showDrawerButton ? (
                <MapControlButton
                    accessibilityHint="Opens the navigation drawer."
                    accessibilityLabel="Open menu"
                    accessibilityRole="button"
                    className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`}
                    glassTintColor={defaultMapControlGlassTintColor}
                    onPress={onDrawerPress}
                    testID="driving-drawer-button"
                >
                    <MapControlIcon
                        color={defaultMapControlIconColor}
                        name="menu"
                    />
                </MapControlButton>
            ) : null}

            <MapLayerButton />

            {drivingMapViewControlIsVisible ? (
                <MapControlButton
                    accessibilityHint={`Switches to ${nextDrivingMapViewPresentation.label.toLowerCase()} map view.`}
                    accessibilityLabel={`Map view: ${drivingMapViewPresentation.label}`}
                    accessibilityRole="button"
                    className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`}
                    glassTintColor={defaultMapControlGlassTintColor}
                    onPress={handleDrivingMapViewPress}
                    testID="driving-map-view-button"
                >
                    <MapControlIcon
                        color={defaultMapControlIconColor}
                        name={drivingMapViewPresentation.iconName}
                    />
                </MapControlButton>
            ) : null}

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
                            ? 'border-daf-alert bg-white dark:bg-daf-surface-dark'
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
                    <MapControlIcon
                        color={
                            freeDriveIsActive
                                ? '#FF4D4F'
                                : defaultMapControlIconColor
                        }
                        name={freeDriveIsActive ? 'x' : 'navigation'}
                    />
                </MapControlButton>
            ) : null}

            <MapControlButton
                accessibilityLabel="Zoom in"
                accessibilityRole="button"
                className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`}
                glassTintColor={defaultMapControlGlassTintColor}
                onPress={() => handleZoomPress(ZOOM_STEP)}
            >
                <MapControlIcon
                    color={defaultMapControlIconColor}
                    name="plus"
                />
            </MapControlButton>

            <MapControlButton
                accessibilityLabel="Zoom out"
                accessibilityRole="button"
                className={`${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`}
                glassTintColor={defaultMapControlGlassTintColor}
                onPress={() => handleZoomPress(-ZOOM_STEP)}
            >
                <MapControlIcon
                    color={defaultMapControlIconColor}
                    name="minus"
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
                    <MapControlIcon
                        color={userLocationButtonIconColor}
                        name="locate-fixed"
                    />
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
