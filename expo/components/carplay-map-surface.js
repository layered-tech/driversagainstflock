import { createAutoPlayMapSurface } from './auto-play-map-surface';

// CarPlay reports accurate safe-area insets for its navigation bar and
// maneuver panels, so the surface can use them unscaled.
const CARPLAY_SURFACE_PLATFORM_CONFIG = {
  hideCompassDuringNavigation: true,
  safeAreaLeftScale: 1,
};

export const CarPlayMapSurface = createAutoPlayMapSurface(
  CARPLAY_SURFACE_PLATFORM_CONFIG,
);
