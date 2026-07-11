export const DEBUG_OVERLAY_SAFE_AREA = 'safeArea';
export const DEBUG_OVERLAY_CAMERA_FOCUS = 'cameraFocus';
export const DEBUG_OVERLAY_CAMERA = 'camera';
export const DEBUG_OVERLAY_NETWORK = 'network';
export const DEBUG_OVERLAY_DIRECTIONS_GEOMETRY = 'directionsGeometry';
export const DEBUG_OVERLAY_ANDROID_AUTO_LOCATION = 'androidAutoLocation';

export const DEBUG_OVERLAY_KEYS = [
  DEBUG_OVERLAY_SAFE_AREA,
  DEBUG_OVERLAY_CAMERA_FOCUS,
  DEBUG_OVERLAY_CAMERA,
  DEBUG_OVERLAY_NETWORK,
  DEBUG_OVERLAY_DIRECTIONS_GEOMETRY,
  DEBUG_OVERLAY_ANDROID_AUTO_LOCATION,
];

export function getAllDebugOverlayVisibility(isVisible) {
  return DEBUG_OVERLAY_KEYS.reduce(
    (visibility, key) => ({
      ...visibility,
      [key]: isVisible === true,
    }),
    {},
  );
}

export function getDebugOverlayVisibilityWithDefaults(
  value,
  defaultIsVisible = false,
) {
  return DEBUG_OVERLAY_KEYS.reduce((visibility, key) => {
    const storedValue = value?.[key];

    return {
      ...visibility,
      [key]:
        typeof storedValue === 'boolean'
          ? storedValue
          : defaultIsVisible === true,
    };
  }, {});
}

export function getDebugOverlayIsVisible(visibility) {
  return DEBUG_OVERLAY_KEYS.some((key) => visibility?.[key] === true);
}

export function getDebugOverlayVisibilityKey(visibility) {
  const normalizedVisibility =
    getDebugOverlayVisibilityWithDefaults(visibility);

  return DEBUG_OVERLAY_KEYS.map((key) =>
    normalizedVisibility[key] ? '1' : '0',
  ).join('');
}
