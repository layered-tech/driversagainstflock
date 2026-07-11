import { createAutoPlayMapSurface } from './auto-play-map-surface';

// The Android Auto host reports an oversized left inset while its maneuver
// rail animates; scaling it keeps ornaments closer to the visible map edge.
// Gesture coordinates need the window scale applied because @rnmapbox/maps
// interprets camera coordinates with the primary screen's scale factor on
// Android (documented @rnmapbox/maps issue in the react-native-auto-play
// README), which breaks pan/zoom gestures on the car screen otherwise.
const ANDROID_AUTO_SURFACE_PLATFORM_CONFIG = {
  applyWindowScaleToMapGestures: true,
  safeAreaLeftScale: 0.65,
};

export const AndroidAutoMapSurface = createAutoPlayMapSurface(
  ANDROID_AUTO_SURFACE_PLATFORM_CONFIG,
);
