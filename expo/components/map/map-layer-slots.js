const ANDROID_AUTO_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: 'top',
    cameraNode: 'top',
    mapProjection: undefined,
    routeLineElevationReference: undefined,
    routeLineOcclusionOpacity: undefined,
    routeLineZOffset: undefined,
    routePath: 'middle',
    userLocationPuck: 'top',
    userLocationPuckAboveLayer: undefined,
});

const CARPLAY_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: undefined,
    cameraNode: undefined,
    mapProjection: 'mercator',
    routeLineElevationReference: 'ground',
    routeLineOcclusionOpacity: 0,
    routeLineZOffset: 0.1,
    routePath: 'top',
    userLocationPuck: undefined,
    userLocationPuckAboveLayer: 'directions-route-line',
});

const DEFAULT_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: undefined,
    cameraNode: undefined,
    mapProjection: undefined,
    routeLineElevationReference: undefined,
    routeLineOcclusionOpacity: undefined,
    routeLineZOffset: undefined,
    routePath: 'top',
    userLocationPuck: undefined,
    userLocationPuckAboveLayer: undefined,
});

export function getMapLayerSlots({ navigationPuckVariant, platform }) {
    if (navigationPuckVariant !== 'auto-play') {
        return DEFAULT_MAP_LAYER_SLOTS;
    }

    if (platform === 'android') {
        return ANDROID_AUTO_MAP_LAYER_SLOTS;
    }

    if (platform === 'ios') {
        return CARPLAY_MAP_LAYER_SLOTS;
    }

    return DEFAULT_MAP_LAYER_SLOTS;
}
