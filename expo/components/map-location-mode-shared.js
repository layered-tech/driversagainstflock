export const LOCATION_ZOOM_LEVEL = 17;
export const LOCATION_CAMERA_ANIMATION_DURATION_MS = 450;
export const LOCATION_CAMERA_CENTER_ANIMATION_DURATION_MS = 220;
export const LOCATION_CAMERA_FRAMING_ANIMATION_DURATION_MS = 280;
export const LOCATION_CAMERA_FRAMING_DELAY_MS = 80;
export const LOCATION_CAMERA_USER_ANIMATION_DURATION_MS = 650;
export const LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS = 320;
export const LOCATION_CAMERA_CENTER_ANIMATION_MODE = "easeTo";
export const LOCATION_CAMERA_FRAMING_ANIMATION_MODE = "easeTo";
export const LOCATION_TRACKING_NONE = "none";
export const LOCATION_TRACKING_LOCK_ON = "lock-on";
export const LOCATION_TRACKING_FOLLOW = "follow";

export const EMPTY_CAMERA_PADDING = {
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
};

export function getCameraPadding(padding) {
  if (Array.isArray(padding)) {
    return {
      paddingTop: padding[0] ?? 0,
      paddingRight: padding[1] ?? 0,
      paddingBottom: padding[2] ?? 0,
      paddingLeft: padding[3] ?? 0,
    };
  }

  if (typeof padding === "number") {
    return {
      paddingBottom: padding,
      paddingLeft: padding,
      paddingRight: padding,
      paddingTop: padding,
    };
  }

  return padding ?? EMPTY_CAMERA_PADDING;
}

export function getCameraPaddingArray(padding) {
  const resolvedPadding = getCameraPadding(padding);

  return [
    resolvedPadding.paddingTop,
    resolvedPadding.paddingRight,
    resolvedPadding.paddingBottom,
    resolvedPadding.paddingLeft,
  ];
}

export function mergeCameraPadding(...paddings) {
  return paddings.reduce(
    (mergedPadding, padding) => {
      const resolvedPadding = getCameraPadding(padding);

      return {
        paddingTop:
          mergedPadding.paddingTop + (resolvedPadding.paddingTop ?? 0),
        paddingRight:
          mergedPadding.paddingRight + (resolvedPadding.paddingRight ?? 0),
        paddingBottom:
          mergedPadding.paddingBottom + (resolvedPadding.paddingBottom ?? 0),
        paddingLeft:
          mergedPadding.paddingLeft + (resolvedPadding.paddingLeft ?? 0),
      };
    },
    { ...EMPTY_CAMERA_PADDING },
  );
}

export function getLocationCoordinate(location) {
  return [location.longitude, location.latitude];
}

export function makeLocationCameraStopPair({
  centerAnimationDuration = LOCATION_CAMERA_CENTER_ANIMATION_DURATION_MS,
  centerCoordinate,
  framingAnimationDuration = LOCATION_CAMERA_FRAMING_ANIMATION_DURATION_MS,
  heading,
  padding,
  pitch,
  zoomLevel,
}) {
  const cameraPadding = getCameraPadding(padding);
  const centerStop = {
    centerCoordinate,
    padding: cameraPadding,
    animationDuration: centerAnimationDuration,
    animationMode: LOCATION_CAMERA_CENTER_ANIMATION_MODE,
  };
  const framingStop = {
    centerCoordinate,
    padding: cameraPadding,
    animationDuration: framingAnimationDuration,
    animationMode: LOCATION_CAMERA_FRAMING_ANIMATION_MODE,
  };

  if (Number.isFinite(pitch)) {
    framingStop.pitch = pitch;
  }

  if (Number.isFinite(heading)) {
    framingStop.heading = heading;
  }

  if (Number.isFinite(zoomLevel)) {
    framingStop.zoomLevel = zoomLevel;
  }

  return {
    centerStop,
    framingStop,
  };
}

export function makeLocationCameraStops(options) {
  const { centerStop, framingStop } = makeLocationCameraStopPair(options);

  return {
    stops: [centerStop, framingStop],
  };
}

export function getTrackingZoomLevel(currentZoomRef, clampZoomLevel) {
  return clampZoomLevel(Math.max(currentZoomRef.current, LOCATION_ZOOM_LEVEL));
}
