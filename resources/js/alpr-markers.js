import {
    ALPR_SYMBOL_ICON_OFFSETS,
    ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
    ALPR_SYMBOL_IMAGE_PROPERTY_NAME,
    ALPR_SYMBOL_IMAGE_SCALE,
    ALPR_SYMBOL_MIN_ZOOM_LEVEL,
    getMarkerAlprSymbolImage,
} from '../../expo/lib/osm/camera-marker-style.js';

export { getMarkerAlprSymbolImage };

export const ALPR_IMAGE_URLS = {
    'falcon-alpr': new URL(
        '../../expo/assets/map/falcon-alpr.png',
        import.meta.url,
    ).href,
    'motorola-alpr': new URL(
        '../../expo/assets/map/motorola-alpr.png',
        import.meta.url,
    ).href,
    'genetec-alpr': new URL(
        '../../expo/assets/map/genetec-alpr.png',
        import.meta.url,
    ).href,
    'axon-alpr': new URL('../../expo/assets/map/axon-alpr.png', import.meta.url)
        .href,
    'leonardo-alpr': new URL(
        '../../expo/assets/map/leonardo-alpr.png',
        import.meta.url,
    ).href,
    'neology-alpr': new URL(
        '../../expo/assets/map/neology-alpr.png',
        import.meta.url,
    ).href,
    'verkada-alpr': new URL(
        '../../expo/assets/map/verkada-alpr.png',
        import.meta.url,
    ).href,
    'generic-alpr': new URL(
        '../../expo/assets/map/generic-alpr.png',
        import.meta.url,
    ).href,
};
export const ALPR_WEB_LAYER_IDS = Object.keys(ALPR_IMAGE_URLS).map(
    (name) => `daf-marker-${name}`,
);

export function makeAlprMarkerLayer(imageName) {
    return {
        id: `daf-marker-${imageName}`,
        source: 'source-markers',
        type: 'symbol',
        minzoom: ALPR_SYMBOL_MIN_ZOOM_LEVEL,
        filter: [
            'all',
            ['!', ['has', 'point_count']],
            ['==', ['get', ALPR_SYMBOL_IMAGE_PROPERTY_NAME], imageName],
        ],
        layout: {
            'icon-image': imageName,
            'icon-anchor': 'bottom',
            'icon-offset': ALPR_SYMBOL_ICON_OFFSETS[imageName].map(
                (value) => value / ALPR_SYMBOL_IMAGE_SCALE,
            ),
            'icon-size': ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-pitch-alignment': 'viewport',
            'icon-rotation-alignment': 'viewport',
        },
    };
}

function syncFallbackMarkers(map) {
    const loadedNames = Object.keys(ALPR_IMAGE_URLS).filter((name) =>
        map.hasImage(name),
    );
    const visible = [
        'case',
        [
            'in',
            ['get', ALPR_SYMBOL_IMAGE_PROPERTY_NAME],
            ['literal', loadedNames],
        ],
        0,
        1,
    ];
    for (const property of ['circle-opacity', 'circle-stroke-opacity']) {
        map.setPaintProperty('daf-marker-dot', property, [
            'step',
            ['zoom'],
            1,
            ALPR_SYMBOL_MIN_ZOOM_LEVEL,
            visible,
        ]);
    }
    map.setPaintProperty('daf-marker-halo', 'circle-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        6,
        0.22,
        15,
        0.42,
        ALPR_SYMBOL_MIN_ZOOM_LEVEL,
        ['*', 0.42, visible],
    ]);
}

export function loadAlprMarkerImages(map, isCurrent = () => true) {
    const source = map.getSource('source-markers');
    return Promise.all(
        Object.entries(ALPR_IMAGE_URLS).map(
            ([name, url]) =>
                new Promise((resolve) => {
                    const install = (error, image) => {
                        if (
                            error ||
                            !image ||
                            !isCurrent() ||
                            map.getSource('source-markers') !== source
                        ) {
                            resolve(false);
                            return;
                        }
                        if (!map.hasImage(name))
                            map.addImage(name, image, {
                                pixelRatio: ALPR_SYMBOL_IMAGE_SCALE,
                            });
                        const layer = makeAlprMarkerLayer(name);
                        if (!map.getLayer(layer.id)) map.addLayer(layer);
                        syncFallbackMarkers(map);
                        resolve(true);
                    };
                    if (map.hasImage(name)) install(null, true);
                    else map.loadImage(url, install);
                }),
        ),
    );
}
