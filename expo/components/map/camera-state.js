import { EMPTY_CAMERA_PADDING } from '../map-location-mode-shared';
import { MAX_WEB_MERCATOR_LATITUDE } from './constants';
import {
    clampZoomLevel,
    normalizeDirectionDegrees,
    normalizeLongitude,
} from './geo';

const CAMERA_BOUNDS_STATE_PRECISION = 4;
const CAMERA_DEBUG_CENTER_PRECISION = 6;
const CAMERA_DEBUG_ORIENTATION_PRECISION = 2;
const CAMERA_DEBUG_ZOOM_PRECISION = 2;
const BOUNDS_FIT_WORLD_SIZE = 512;
const BOUNDS_FIT_MIN_VIEWPORT_SIZE = 1;

function getRoundedCameraValue(value, precision) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? Number(numericValue.toFixed(precision))
        : null;
}

function getRoundedCameraBoundsValue(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? numericValue.toFixed(CAMERA_BOUNDS_STATE_PRECISION)
        : '';
}

export function getCameraPadding(padding) {
    if (Array.isArray(padding)) {
        return {
            paddingTop: padding[0] ?? 0,
            paddingRight: padding[1] ?? 0,
            paddingBottom: padding[2] ?? 0,
            paddingLeft: padding[3] ?? 0,
        };
    }

    if (typeof padding === 'number') {
        return {
            paddingBottom: padding,
            paddingLeft: padding,
            paddingRight: padding,
            paddingTop: padding,
        };
    }

    return padding ?? EMPTY_CAMERA_PADDING;
}

export function getFlatCameraStop(cameraStop, padding = EMPTY_CAMERA_PADDING) {
    return {
        ...cameraStop,
        padding: getCameraPadding(padding),
        pitch: 0,
    };
}

function getMercatorX(longitude) {
    return (normalizeLongitude(longitude) + 180) / 360;
}

function getMercatorY(latitude) {
    const clampedLatitude = Math.max(
        -MAX_WEB_MERCATOR_LATITUDE,
        Math.min(MAX_WEB_MERCATOR_LATITUDE, latitude),
    );
    const latitudeRadians = (clampedLatitude * Math.PI) / 180;

    return (
        (1 - Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) / Math.PI) /
        2
    );
}

function getLatitudeFromMercatorY(mercatorY) {
    return (
        (Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY))) * 180) / Math.PI
    );
}

function getBoundsFitZoomLevel(spanNormalized, availableSize) {
    if (spanNormalized <= 0) {
        return null;
    }

    return Math.log2(availableSize / (BOUNDS_FIT_WORLD_SIZE * spanNormalized));
}

/**
 * Mapbox's native bounds-to-camera conversion (`Camera.fitBounds` /
 * `setCamera` with `bounds`) re-centers without recomputing zoom under the
 * Standard style's globe projection, so the fit is computed here in Web
 * Mercator space and applied as a plain center + zoom camera stop, which
 * every projection and platform honors.
 *
 * @return {{
 *   animationDuration: number,
 *   animationMode: string,
 *   centerCoordinate: [number, number],
 *   heading: number,
 *   padding: object,
 *   pitch: number,
 *   zoomLevel: number,
 * } | null}
 */
export function getBoundsFitCameraStop({
    bounds,
    duration = 0,
    padding = EMPTY_CAMERA_PADDING,
    viewportHeight,
    viewportWidth,
}) {
    const west = Number(bounds?.sw?.[0]);
    const south = Number(bounds?.sw?.[1]);
    const east = Number(bounds?.ne?.[0]);
    const north = Number(bounds?.ne?.[1]);

    if (
        ![west, south, east, north].every(Number.isFinite) ||
        !Number.isFinite(viewportWidth) ||
        !Number.isFinite(viewportHeight) ||
        viewportWidth <= 0 ||
        viewportHeight <= 0
    ) {
        return null;
    }

    const cameraPadding = getCameraPadding(padding);
    const availableWidth = Math.max(
        BOUNDS_FIT_MIN_VIEWPORT_SIZE,
        viewportWidth - cameraPadding.paddingLeft - cameraPadding.paddingRight,
    );
    const availableHeight = Math.max(
        BOUNDS_FIT_MIN_VIEWPORT_SIZE,
        viewportHeight - cameraPadding.paddingTop - cameraPadding.paddingBottom,
    );
    const westX = getMercatorX(west);
    const eastX = getMercatorX(east);
    const northY = getMercatorY(north);
    const southY = getMercatorY(south);
    const spanX = eastX >= westX ? eastX - westX : eastX - westX + 1;
    const spanY = Math.max(0, southY - northY);
    const zoomForWidth = getBoundsFitZoomLevel(spanX, availableWidth);
    const zoomForHeight = getBoundsFitZoomLevel(spanY, availableHeight);
    const zoomLevel = Math.min(
        zoomForWidth ?? Infinity,
        zoomForHeight ?? Infinity,
    );
    const centerX = westX + spanX / 2;
    const centerLongitude = normalizeLongitude(centerX * 360 - 180);
    const centerLatitude = getLatitudeFromMercatorY((northY + southY) / 2);

    return {
        animationDuration: duration,
        animationMode: 'easeTo',
        centerCoordinate: [centerLongitude, centerLatitude],
        heading: 0,
        padding: cameraPadding,
        pitch: 0,
        zoomLevel: clampZoomLevel(
            Number.isFinite(zoomLevel) ? zoomLevel : Infinity,
        ),
    };
}

export function getCameraBoundsStateKey(bounds) {
    return [
        getRoundedCameraBoundsValue(bounds?.sw?.[0]),
        getRoundedCameraBoundsValue(bounds?.sw?.[1]),
        getRoundedCameraBoundsValue(bounds?.ne?.[0]),
        getRoundedCameraBoundsValue(bounds?.ne?.[1]),
    ].join(',');
}

export function getCameraDebugState(state) {
    const center = state?.properties?.center;
    const longitude = getRoundedCameraValue(
        center?.[0],
        CAMERA_DEBUG_CENTER_PRECISION,
    );
    const latitude = getRoundedCameraValue(
        center?.[1],
        CAMERA_DEBUG_CENTER_PRECISION,
    );
    const zoomLevel = getRoundedCameraValue(
        state?.properties?.zoom,
        CAMERA_DEBUG_ZOOM_PRECISION,
    );
    const heading = getRoundedCameraValue(
        state?.properties?.heading ?? state?.properties?.bearing,
        CAMERA_DEBUG_ORIENTATION_PRECISION,
    );
    const pitch = getRoundedCameraValue(
        state?.properties?.pitch,
        CAMERA_DEBUG_ORIENTATION_PRECISION,
    );

    if (
        longitude === null &&
        latitude === null &&
        zoomLevel === null &&
        heading === null &&
        pitch === null
    ) {
        return null;
    }

    return {
        heading: heading === null ? null : normalizeDirectionDegrees(heading),
        latitude,
        longitude,
        pitch,
        zoomLevel,
    };
}

export function getCameraDebugStateKey(cameraState) {
    return [
        cameraState?.longitude,
        cameraState?.latitude,
        cameraState?.zoomLevel,
        cameraState?.heading,
        cameraState?.pitch,
    ].join(',');
}
