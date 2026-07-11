import {
    MAX_WEB_MERCATOR_LATITUDE,
    MAX_ZOOM_LEVEL,
    MIN_ZOOM_LEVEL,
} from './constants';
import {
    clampLatitude,
    getLongitudeIntervals,
    getStoredNumber,
    normalizeLongitude,
    roundCoordinate,
} from './geo';

export const OFFLINE_MAP_PACK_NAME = 'driversagainstflock-offline-map';
export const OFFLINE_MAP_METADATA_SOURCE = 'driversagainstflock';
export const OFFLINE_MIN_ZOOM_LEVEL = Math.max(MIN_ZOOM_LEVEL, 3);
export const OFFLINE_MAX_ZOOM_OPTIONS = [12, 14, 16, 18].filter(
    (zoomLevel) => zoomLevel <= MAX_ZOOM_LEVEL,
);
export const OFFLINE_DEFAULT_MAX_ZOOM_LEVEL =
    OFFLINE_MAX_ZOOM_OPTIONS[1] ?? OFFLINE_MIN_ZOOM_LEVEL;

const ESTIMATED_BYTES_PER_TILE = 45 * 1024;
const ESTIMATED_STYLE_RESOURCE_BYTES = 8 * 1024 * 1024;
const coordinateFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
});

function getCoordinatePair(value) {
    if (!Array.isArray(value) || value.length < 2) {
        return null;
    }

    const longitude = getStoredNumber(value[0]);
    const latitude = getStoredNumber(value[1]);

    if (
        longitude === null ||
        latitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), clampLatitude(latitude)];
}

function normalizeBoundsArray(bounds) {
    if (!Array.isArray(bounds)) {
        return null;
    }

    if (bounds.length >= 4) {
        const northEast = getCoordinatePair([bounds[0], bounds[1]]);
        const southWest = getCoordinatePair([bounds[2], bounds[3]]);

        if (northEast && southWest) {
            return normalizeOfflineBounds({ ne: northEast, sw: southWest });
        }
    }

    if (bounds.length >= 2) {
        const first = getCoordinatePair(bounds[0]);
        const second = getCoordinatePair(bounds[1]);

        if (first && second) {
            return normalizeOfflineBounds({ sw: first, ne: second });
        }
    }

    return null;
}

function normalizeBoundsFeatureCollection(bounds) {
    const featureCollection =
        typeof bounds === 'string' ? parseJSONValue(bounds) : bounds;
    const features = featureCollection?.features;

    if (!Array.isArray(features) || features.length < 2) {
        return null;
    }

    const first = getCoordinatePair(features[0]?.geometry?.coordinates);
    const second = getCoordinatePair(features[1]?.geometry?.coordinates);

    if (!first || !second) {
        return null;
    }

    return normalizeOfflineBounds({ ne: first, sw: second });
}

function parseJSONValue(value) {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function normalizeOfflineBounds(bounds) {
    if (!bounds) {
        return null;
    }

    if (Array.isArray(bounds)) {
        return normalizeBoundsArray(bounds);
    }

    if (bounds.type === 'FeatureCollection') {
        return normalizeBoundsFeatureCollection(bounds);
    }

    const rawSouthWest = bounds.sw ?? bounds.southWest ?? bounds.southwest;
    const rawNorthEast = bounds.ne ?? bounds.northEast ?? bounds.northeast;
    const southWest = getCoordinatePair(rawSouthWest);
    const northEast = getCoordinatePair(rawNorthEast);

    if (!southWest || !northEast) {
        return null;
    }

    const southLatitude = clampLatitude(Math.min(southWest[1], northEast[1]));
    const northLatitude = clampLatitude(Math.max(southWest[1], northEast[1]));

    return {
        sw: [roundCoordinate(southWest[0]), roundCoordinate(southLatitude)],
        ne: [roundCoordinate(northEast[0]), roundCoordinate(northLatitude)],
    };
}

export function getOfflinePackBounds(metadata, packBounds) {
    return (
        normalizeOfflineBounds(metadata?.regionBounds) ??
        normalizeOfflineBounds(metadata?.bounds) ??
        normalizeOfflineBounds(metadata?._rnmapbox?.bounds) ??
        normalizeOfflineBounds(packBounds) ??
        normalizeBoundsFeatureCollection(packBounds)
    );
}

export function getOfflineBoundsKey(bounds) {
    const normalizedBounds = normalizeOfflineBounds(bounds);

    if (!normalizedBounds) {
        return '';
    }

    return [
        normalizedBounds.sw[0],
        normalizedBounds.sw[1],
        normalizedBounds.ne[0],
        normalizedBounds.ne[1],
    ].join(',');
}

function longitudeToTileX(longitude, zoomLevel) {
    const tileCount = 2 ** zoomLevel;
    const normalizedLongitude = normalizeLongitude(longitude);

    if (normalizedLongitude >= 180) {
        return tileCount - 1;
    }

    const x = Math.floor(((normalizedLongitude + 180) / 360) * tileCount);

    return Math.min(tileCount - 1, Math.max(0, x));
}

function latitudeToTileY(latitude, zoomLevel) {
    const tileCount = 2 ** zoomLevel;
    const clampedLatitude = Math.min(
        MAX_WEB_MERCATOR_LATITUDE,
        Math.max(-MAX_WEB_MERCATOR_LATITUDE, latitude),
    );
    const latitudeRadians = (clampedLatitude * Math.PI) / 180;
    const y = Math.floor(
        ((1 -
            Math.log(
                Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians),
            ) /
                Math.PI) /
            2) *
            tileCount,
    );

    return Math.min(tileCount - 1, Math.max(0, y));
}

function getTileCountForZoom(bounds, zoomLevel) {
    const westLongitude = normalizeLongitude(bounds.sw[0]);
    const eastLongitude = normalizeLongitude(bounds.ne[0]);
    const southLatitude = Math.min(bounds.sw[1], bounds.ne[1]);
    const northLatitude = Math.max(bounds.sw[1], bounds.ne[1]);
    const yNorth = latitudeToTileY(northLatitude, zoomLevel);
    const ySouth = latitudeToTileY(southLatitude, zoomLevel);
    const yCount = Math.abs(ySouth - yNorth) + 1;

    return getLongitudeIntervals(westLongitude, eastLongitude).reduce(
        (sum, [intervalWest, intervalEast]) => {
            const xWest = longitudeToTileX(intervalWest, zoomLevel);
            const xEast = longitudeToTileX(intervalEast, zoomLevel);
            const xCount = Math.abs(xEast - xWest) + 1;

            return sum + xCount * yCount;
        },
        0,
    );
}

export function getOfflineRegionEstimate(bounds, maxZoomLevel) {
    const normalizedBounds = normalizeOfflineBounds(bounds);
    const normalizedMaxZoomLevel = getStoredNumber(maxZoomLevel);

    if (!normalizedBounds || normalizedMaxZoomLevel === null) {
        return null;
    }

    const maxZoom = Math.min(
        MAX_ZOOM_LEVEL,
        Math.max(OFFLINE_MIN_ZOOM_LEVEL, Math.floor(normalizedMaxZoomLevel)),
    );
    let tileCount = 0;

    for (
        let zoomLevel = OFFLINE_MIN_ZOOM_LEVEL;
        zoomLevel <= maxZoom;
        zoomLevel += 1
    ) {
        tileCount += getTileCountForZoom(normalizedBounds, zoomLevel);
    }

    return {
        estimatedBytes: Math.round(
            tileCount * ESTIMATED_BYTES_PER_TILE +
                ESTIMATED_STYLE_RESOURCE_BYTES,
        ),
        maxZoom,
        minZoom: OFFLINE_MIN_ZOOM_LEVEL,
        tileCount,
    };
}

export function formatBytes(bytes) {
    const numericBytes = getStoredNumber(bytes);

    if (numericBytes === null || numericBytes < 0) {
        return '--';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = numericBytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const maximumFractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;

    return `${value.toFixed(maximumFractionDigits)} ${units[unitIndex]}`;
}

export function formatTileCount(tileCount) {
    const numericTileCount = getStoredNumber(tileCount);

    return numericTileCount === null
        ? '--'
        : integerFormatter.format(numericTileCount);
}

function formatLatitude(latitude) {
    const direction = latitude >= 0 ? 'N' : 'S';

    return `${coordinateFormatter.format(Math.abs(latitude))} ${direction}`;
}

function formatLongitude(longitude) {
    const direction = longitude >= 0 ? 'E' : 'W';

    return `${coordinateFormatter.format(Math.abs(longitude))} ${direction}`;
}

export function formatOfflineBounds(bounds) {
    const normalizedBounds = normalizeOfflineBounds(bounds);

    if (!normalizedBounds) {
        return 'No region selected';
    }

    return `${formatLatitude(normalizedBounds.sw[1])}, ${formatLongitude(
        normalizedBounds.sw[0],
    )} to ${formatLatitude(normalizedBounds.ne[1])}, ${formatLongitude(
        normalizedBounds.ne[0],
    )}`;
}

export function formatOfflineError(error) {
    if (!error) {
        return 'Offline map failed. Please try again.';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.message) {
        return error.message;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return 'Offline map failed. Please try again.';
    }
}
