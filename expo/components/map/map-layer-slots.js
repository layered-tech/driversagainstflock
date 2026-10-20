const ANDROID_AUTO_MAP_LAYER_SLOTS = Object.freeze({
    cameraCone: 'middle',
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
    cameraCone: 'middle',
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
    cameraCone: 'middle',
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

export function getCameraOverlayLayerPlacement({
    platform,
    slots,
    puckIsReady,
    puckKind = '3d',
}) {
    const modelLayerID = {
        android: 'mapbox-location-model-layer',
        ios: 'puck-model-layer',
    }[platform];
    const indicatorLayerID = {
        android: 'mapbox-location-indicator-layer',
        ios: 'puck',
    }[platform];
    const puckLayerID = puckKind === '2d' ? indicatorLayerID : modelLayerID;
    const puckSlot = puckKind === '2d' ? undefined : slots.userLocationPuck;

    // Referencing a puck that has not been created makes RNMapbox wait to add
    // the camera layers. Keep the inventory independent until it is verified.
    if (!puckIsReady || !puckLayerID) {
        return {
            aboveLayerID: undefined,
            coneSlot: slots.cameraCone,
            nodeSlot: slots.cameraNode,
        };
    }

    return {
        aboveLayerID: puckLayerID,
        coneSlot: puckSlot,
        nodeSlot: puckSlot,
    };
}

export async function waitForCameraOverlayPuck2D({
    readState,
    isCurrent,
    waitForCommit = () => new Promise((resolve) => setTimeout(resolve, 50)),
}) {
    for (let attempt = 0; attempt < 10 && isCurrent(); attempt += 1) {
        await waitForCommit();
        if (!isCurrent()) return false;
        let state;
        try {
            state = await readState();
        } catch {
            return false;
        }
        if (!isCurrent() || !state) return false;
        if (state.puckKind === '2d' && state.indicatorLayerExists === true) {
            return true;
        }
    }
    return false;
}
