import { createAutoPlayMapSurface } from './auto-play-map-surface';

// The Android Auto host reports an oversized left inset while its maneuver
// rail animates; scaling it keeps ornaments closer to the visible map edge.
// Camera placement must use the raw host inset so the location stays centered.
// Gesture coordinates need the window scale applied because @rnmapbox/maps
// interprets camera coordinates with the primary screen's scale factor on
// Android (documented @rnmapbox/maps issue in the react-native-auto-play
// README), which breaks pan/zoom gestures on the car screen otherwise.
const ANDROID_AUTO_SURFACE_PLATFORM_CONFIG = {
    applyWindowScaleToMapGestures: true,
    currentRoadPill: {
        reserveSpeedLimitSpace: true,
        speedLimitGap: 8,
        speedLimitAdjacentTextStyle: {
            fontSize: 12,
            lineHeight: 16,
        },
        textStyle: {
            fontSize: 14,
            lineHeight: 20,
        },
    },
    hideCompassDuringNavigation: true,
    hideMapboxCompass: true,
    ornamentSafeAreaLeftScale: 0.65,
    speedLimitBadge: {
        portraitSize: 56,
    },
    usesHostColorSchemeForAutomaticMapPreset: true,
};

export const AndroidAutoMapSurface = createAutoPlayMapSurface(
    ANDROID_AUTO_SURFACE_PLATFORM_CONFIG,
);

// The instrument cluster is a secondary display owned by the host. Keep it to
// map and route rendering; status cards belong to the main NavigationTemplate.
export const AndroidAutoClusterSurface = createAutoPlayMapSurface({
    ...ANDROID_AUTO_SURFACE_PLATFORM_CONFIG,
    hostOwnsNavigationUI: true,
});
