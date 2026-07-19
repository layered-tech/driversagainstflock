const ANDROID_AUTO_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: 'top',
    cameraNode: 'top',
    routePath: 'middle',
    userLocationPuck: 'top',
    userLocationPuckAboveLayer: undefined,
});

const CARPLAY_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: undefined,
    cameraNode: undefined,
    routePath: 'top',
    userLocationPuck: undefined,
    userLocationPuckAboveLayer: undefined,
});

const DEFAULT_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: undefined,
    cameraNode: undefined,
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
