import { useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { LOCATION_TRACKING_NONE } from '../map-location-mode-shared';
import {
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    MAPBOX_STANDARD_STYLE_URL,
} from './config';
import {
    DRIVING_DESTINATION_SURFACE_HEIGHT,
    MAP_CONTROL_BUTTON_CLASS_NAME,
    MAP_CONTROL_EDGE_OFFSET,
    MAP_SEARCH_BAR_HEIGHT,
} from './constants';
import { getMapLayerByStyleURL } from './map-preferences';
import { getMapboxCompassSafeAreaInsets } from './mapbox-ornament-layout';

const DRIVING_ROUTE_COMPASS_EXTRA_BOTTOM_OFFSET = 18;

export function useMapPresentation({
    destinationCardIsOverlay = true,
    hasActiveDirectionsRoute = false,
    isDrivingMode,
    locationTrackingMode,
    mapLightPreset,
    mapStyleURL,
    safeAreaInsetsOverride,
    searchSource,
    voiceSearchIsListening,
}) {
    const measuredInsets = useSafeAreaInsets();
    const insets = safeAreaInsetsOverride ?? measuredInsets;
    const isSystemDarkMode = useColorScheme() === 'dark';
    const resolvedSearchSource =
        searchSource || (isDrivingMode ? 'driving' : 'map');
    const selectedMapLayer =
        getMapLayerByStyleURL(mapStyleURL) ??
        getMapLayerByStyleURL(MAPBOX_STANDARD_STYLE_URL);
    const isDarkMapLayer =
        mapLightPreset === MAPBOX_STANDARD_LIGHT_PRESET_NIGHT;
    const isSatelliteMapLayer = selectedMapLayer.key === 'standard-satellite';
    const isTrackingActive = locationTrackingMode !== LOCATION_TRACKING_NONE;
    const trackingButtonAccessibilityLabel = isTrackingActive
        ? 'Reorient map north up'
        : 'Go to your location';
    const mapLayerAccessibilityLabel = `Map layer: ${selectedMapLayer.label}. Open map layer options`;
    const darkMapControlClassName =
        'border-daf-border-dark bg-daf-surface-dark';
    const lightMapControlClassName = 'border-white bg-white';
    const defaultMapControlClassName = isDarkMapLayer
        ? darkMapControlClassName
        : lightMapControlClassName;
    const defaultMapControlIconColor = isDarkMapLayer ? '#ffffff' : '#171717';
    const defaultMapControlGlassTintColor = isDarkMapLayer
        ? 'rgba(23,23,23,0.72)'
        : 'rgba(255,255,255,0.68)';
    const mapLayerIconColor = isSatelliteMapLayer
        ? '#1FBF6B'
        : defaultMapControlIconColor;
    const mapLayerButtonGlassTintColor = isSatelliteMapLayer
        ? 'rgba(230,249,239,0.78)'
        : defaultMapControlGlassTintColor;
    const mapLayerButtonClassName = isSatelliteMapLayer
        ? `${MAP_CONTROL_BUTTON_CLASS_NAME} border-daf-brand bg-white`
        : `${MAP_CONTROL_BUTTON_CLASS_NAME} ${defaultMapControlClassName}`;
    const drivingRecenterButtonGlassTintColor = isDarkMapLayer
        ? 'rgba(31,191,107,0.58)'
        : 'rgba(230,249,239,0.78)';
    const drivingRecenterButtonClassName = isDarkMapLayer
        ? `${MAP_CONTROL_BUTTON_CLASS_NAME} border-daf-brand bg-daf-surface-dark disabled:opacity-70`
        : `${MAP_CONTROL_BUTTON_CLASS_NAME} border-daf-brand bg-white disabled:opacity-70`;
    const trackingButtonStateClassName = isTrackingActive
        ? 'border-daf-brand bg-daf-brand'
        : isDarkMapLayer
          ? darkMapControlClassName
          : lightMapControlClassName;
    const trackingButtonClassName = `${MAP_CONTROL_BUTTON_CLASS_NAME} disabled:opacity-70 ${trackingButtonStateClassName}`;
    const trackingButtonGlassTintColor = isTrackingActive
        ? 'rgba(37,99,235,0.74)'
        : defaultMapControlGlassTintColor;
    const trackingIconColor = (() => {
        if (isTrackingActive) {
            return '#ffffff';
        }

        if (isDarkMapLayer) {
            return isTrackingActive ? '#2FC177' : '#ffffff';
        }

        return isTrackingActive ? '#1FBF6B' : '#171717';
    })();
    const drivingRecenterIconColor = isDarkMapLayer ? '#2FC177' : '#1FBF6B';
    const locatingIndicatorColor = isDarkMapLayer ? '#ffffff' : '#1FBF6B';
    const primaryButtonIndicatorColor = isSystemDarkMode
        ? '#171717'
        : '#ffffff';
    const searchPlaceholderColor = isSystemDarkMode ? '#a3a3a3' : '#737373';
    const searchIconColor = isSystemDarkMode ? '#a3a3a3' : '#525252';
    const searchPrimaryIconColor = isSystemDarkMode ? '#f5f5f5' : '#171717';
    const searchGlassTintColor = isSystemDarkMode
        ? 'rgba(23,23,23,0.72)'
        : 'rgba(255,255,255,0.7)';
    const voiceSearchIconColor = voiceSearchIsListening
        ? '#FF4D4F'
        : searchPrimaryIconColor;
    const mapboxCompassInsets = getMapboxCompassSafeAreaInsets({
        insets,
        platformOS: Platform.OS,
    });
    // The car screen surface never renders the phone's bottom destination
    // card — the head unit draws its own ETA card and reports it through the
    // safe-area insets — so lifting the compass by the card height there
    // stacks on top of the host insets and strands it mid-screen.
    const drivingRouteCompassBottomOffset =
        resolvedSearchSource === 'auto-play'
            ? DRIVING_ROUTE_COMPASS_EXTRA_BOTTOM_OFFSET
            : DRIVING_DESTINATION_SURFACE_HEIGHT;
    // On iOS the native Mapbox SDK already positions its ornaments (logo,
    // attribution, compass) relative to the safe area layout guides, so adding
    // the JS safe-area insets on top double-counts them and pushes the branding
    // too high. Android measures ornament margins from the raw map edge, so the
    // insets must be applied manually there.
    const mapboxBrandingUsesSafeAreaInsets = Platform.OS !== 'ios';
    const mapboxBrandingInsetBottom = mapboxBrandingUsesSafeAreaInsets
        ? insets.bottom
        : 0;
    const mapboxBrandingInsetLeft = mapboxBrandingUsesSafeAreaInsets
        ? insets.left
        : 0;
    const mapboxBrandingInsetRight = mapboxBrandingUsesSafeAreaInsets
        ? insets.right
        : 0;
    const bottomSheetBackgroundStyle = useMemo(
        () => ({
            // Match the sheet content surface (daf-surface-dark / white) so the
            // handle strip is flush with the body. Using a different dark value here
            // produces a two-tone seam at the handle in dark mode.
            backgroundColor: isSystemDarkMode ? '#161B22' : '#ffffff',
        }),
        [isSystemDarkMode],
    );
    const bottomSheetHandleIndicatorStyle = useMemo(
        () => ({
            backgroundColor: isSystemDarkMode ? '#3A434E' : '#D4D9DF',
        }),
        [isSystemDarkMode],
    );
    const mapCompassPosition = useMemo(() => {
        if (isDrivingMode) {
            const destinationBarOffset =
                hasActiveDirectionsRoute && destinationCardIsOverlay
                    ? drivingRouteCompassBottomOffset
                    : 0;

            return {
                bottom:
                    mapboxCompassInsets.bottom +
                    MAP_CONTROL_EDGE_OFFSET +
                    destinationBarOffset,
                left: mapboxCompassInsets.left + MAP_CONTROL_EDGE_OFFSET,
            };
        }

        return {
            left: mapboxCompassInsets.left + MAP_CONTROL_EDGE_OFFSET,
            top:
                mapboxCompassInsets.top +
                MAP_CONTROL_EDGE_OFFSET +
                MAP_SEARCH_BAR_HEIGHT +
                MAP_CONTROL_EDGE_OFFSET,
        };
    }, [
        destinationCardIsOverlay,
        drivingRouteCompassBottomOffset,
        hasActiveDirectionsRoute,
        isDrivingMode,
        mapboxCompassInsets.bottom,
        mapboxCompassInsets.left,
        mapboxCompassInsets.top,
    ]);
    const mapControlLayoutInsets = useMemo(
        () => ({
            bottom: insets.bottom + MAP_CONTROL_EDGE_OFFSET,
            left: insets.left + MAP_CONTROL_EDGE_OFFSET,
            right: insets.right + MAP_CONTROL_EDGE_OFFSET,
            top: insets.top + MAP_CONTROL_EDGE_OFFSET,
        }),
        [insets.bottom, insets.left, insets.right, insets.top],
    );
    const mapDebugControlPosition = useMemo(
        () => ({
            bottom: insets.bottom + MAP_CONTROL_EDGE_OFFSET,
            left: insets.left + MAP_CONTROL_EDGE_OFFSET,
        }),
        [insets.bottom, insets.left],
    );
    const mapboxAttributionPosition = useMemo(
        () => ({
            bottom: mapboxBrandingInsetBottom + MAP_CONTROL_EDGE_OFFSET,
            right: mapboxBrandingInsetRight + MAP_CONTROL_EDGE_OFFSET,
        }),
        [mapboxBrandingInsetBottom, mapboxBrandingInsetRight],
    );
    const mapboxLogoPosition = useMemo(
        () => ({
            bottom: mapboxBrandingInsetBottom + MAP_CONTROL_EDGE_OFFSET,
            left: mapboxBrandingInsetLeft + MAP_CONTROL_EDGE_OFFSET,
        }),
        [mapboxBrandingInsetBottom, mapboxBrandingInsetLeft],
    );

    return {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        defaultMapControlClassName,
        defaultMapControlGlassTintColor,
        defaultMapControlIconColor,
        drivingRecenterButtonClassName,
        drivingRecenterButtonGlassTintColor,
        drivingRecenterIconColor,
        insets,
        isDarkMapLayer,
        isSystemDarkMode,
        isTrackingActive,
        locatingIndicatorColor,
        mapboxAttributionPosition,
        mapboxLogoPosition,
        mapCompassPosition,
        mapControlLayoutInsets,
        mapDebugControlPosition,
        mapLayerAccessibilityLabel,
        mapLayerButtonClassName,
        mapLayerButtonGlassTintColor,
        mapLayerIconColor,
        primaryButtonIndicatorColor,
        searchIconColor,
        searchGlassTintColor,
        searchPlaceholderColor,
        searchPrimaryIconColor,
        searchSource: resolvedSearchSource,
        selectedMapLayer,
        trackingButtonAccessibilityLabel,
        trackingButtonClassName,
        trackingButtonGlassTintColor,
        trackingIconColor,
        voiceSearchIconColor,
    };
}
