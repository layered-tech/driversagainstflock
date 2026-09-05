import { createAutoPlayMapSurface } from './auto-play-map-surface';

// CarPlay reports accurate safe-area insets for its navigation bar and
// maneuver panels, so the surface can use them unscaled.
//
// CarPlay draws the maneuver card, trip estimates and nav bar itself, but the
// app still owns everything inside the map canvas: the current road pill, the
// speed limit badge, the puck's follow anchor and the navigation alert banner.
// Suppressing those here (`hostOwnsNavigationUI`) also strips the measured
// anchor that keeps the puck off centre, so secondary surfaces are excluded
// through `isRootMapSurface` instead.
const CARPLAY_SURFACE_PLATFORM_CONFIG = {
    currentRoadPill: {
        textStyle: {
            fontSize: 11,
            lineHeight: 16,
        },
    },
    hideCompassDuringNavigation: true,
    ornamentSafeAreaLeftScale: 1,
    usesHostColorSchemeForAutomaticMapPreset: false,
};

export const CarPlayMapSurface = createAutoPlayMapSurface(
    CARPLAY_SURFACE_PLATFORM_CONFIG,
);
