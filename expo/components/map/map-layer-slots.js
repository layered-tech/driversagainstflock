const ANDROID_AUTO_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: 'top',
    cameraNode: 'top',
    routePath: 'middle',
    userLocationPuck: 'middle',
    userLocationPuckAboveLayer: 'directions-route-line',
});

const DEFAULT_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: undefined,
    cameraNode: undefined,
    routePath: 'top',
    userLocationPuck: undefined,
    userLocationPuckAboveLayer: undefined,
});

export function getMapLayerSlots({ navigationPuckVariant, platform }) {
    return platform === 'android' && navigationPuckVariant === 'auto-play'
        ? ANDROID_AUTO_MAP_LAYER_SLOTS
        : DEFAULT_MAP_LAYER_SLOTS;
}
