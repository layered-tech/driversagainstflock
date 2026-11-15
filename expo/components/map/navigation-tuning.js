// Central tuning for the native 3D puck and driving camera.
// Puck keys are map zoom levels; values are map-relative model scales (not pixels).
// Speed keys are minimum MPH: select the highest threshold reached, never interpolate.
// Sparse tables merge by key. Scalars replace inherited values.
// Precedence: base -> mode -> platform -> surface -> surface mode.
// Platform/surface puckScaleFactor and zoomOffset apply after table overrides.
export const NAVIGATION_TUNING = {
    base: {
        puckScaleByZoom: {
            9: 8192,
            10: 4096,
            11: 2048,
            12: 1024,
            13: 512,
            14: 256,
            15: 128,
            16: 64,
            17: 32,
            18: 16,
            19: 8,
            20: 4,
        },
        zoomBySpeedMph: {
            0: 18.5,
            30: 18.25,
            35: 17.5,
            40: 16.75,
            45: 16,
            50: 15.25,
            55: 14.5,
            65: 13.75,
        },
        puckScaleFactor: 1,
        zoomOffset: 0,
    },
    modes: {
        perspective: {},
        'north-up': {},
        'route-overview': {},
    },
    platforms: {
        android: {
            surfaces: {
                phone: { modes: {} },
                automotive: {
                    puckScaleFactor: 0.6,
                    modes: {
                        'north-up': { puckScaleFactor: 0.4, zoomOffset: -3 },
                    },
                },
                cluster: { puckScaleFactor: 0.6 },
            },
        },
        ios: {
            surfaces: {
                phone: { modes: {} },
                automotive: { modes: {} },
                dashboard: { modes: {} },
                cluster: { modes: {} },
            },
        },
    },
};

export function resolveNavigationTuning({
    platform = 'android',
    surface = 'phone',
    mode = 'perspective',
} = {}) {
    if (surface === 'cluster') mode = 'perspective';
    const platformConfig = NAVIGATION_TUNING.platforms[platform];
    const surfaceConfig = platformConfig?.surfaces?.[surface];
    const resolved = {};
    for (const layer of [
        NAVIGATION_TUNING.base,
        NAVIGATION_TUNING.modes[mode],
        platformConfig,
        surfaceConfig,
        surfaceConfig?.modes?.[mode],
    ]) {
        if (!layer) continue;
        for (const key of ['puckScaleByZoom', 'zoomBySpeedMph']) {
            resolved[key] = { ...resolved[key], ...layer[key] };
        }
        for (const key of ['puckScaleFactor', 'zoomOffset']) {
            if (layer[key] !== undefined) resolved[key] = layer[key];
        }
    }
    return resolved;
}

export function getSpeedZoomStops(tuning = resolveNavigationTuning()) {
    return Object.entries(tuning.zoomBySpeedMph)
        .map(([speedMph, zoomLevel]) => ({
            speedMph: Number(speedMph),
            zoomLevel,
        }))
        .sort((a, b) => a.speedMph - b.speedMph);
}

export function getPuckZoomStops(options) {
    const tuning = resolveNavigationTuning(options);
    return Object.entries(tuning.puckScaleByZoom)
        .map(([zoomLevel, mapScale]) => ({
            zoomLevel: Number(zoomLevel),
            mapScale: mapScale * tuning.puckScaleFactor,
        }))
        .sort((a, b) => a.zoomLevel - b.zoomLevel);
}
