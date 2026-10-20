import { getCameraManufacturerMatches } from './camera-manufacturers.js';

export const GENERIC_ALPR_SYMBOL_IMAGE_NAME = 'generic-alpr';
export const ALPR_SYMBOL_IMAGE_PROPERTY_NAME = 'alprSymbolImage';
export const ALPR_SYMBOL_VISIBLE_PROPERTY_NAME = 'showsAlprSymbol';
export const ALPR_SYMBOL_MIN_ZOOM_LEVEL = 16;
export const ALPR_SYMBOL_IMAGE_SCALE = 2;
export const ALPR_SYMBOL_ICON_OFFSETS = {
    'falcon-alpr': [-88, 27],
    'motorola-alpr': [6.5, 17],
    'genetec-alpr': [269, 12],
    'axon-alpr': [-226.5, 61],
    'leonardo-alpr': [39, 30],
    'neology-alpr': [-147.5, 53],
    'verkada-alpr': [203, 18],
    'generic-alpr': [-196.5, 24],
};
// Density compensation avoids Mapbox's signed 16-bit symbol-corner overflow.
export const ALPR_SYMBOL_ICON_SIZE_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    16,
    0.063 * ALPR_SYMBOL_IMAGE_SCALE,
    18,
    0.0805 * ALPR_SYMBOL_IMAGE_SCALE,
    20,
    0.098 * ALPR_SYMBOL_IMAGE_SCALE,
];

function getNodeAlprSymbolImage(node) {
    const tags = node?.tags ?? {};
    const type = String(tags['surveillance:type'] ?? '')
        .trim()
        .toLowerCase();

    if (type && type !== 'alpr' && type !== 'anpr') {
        return null;
    }

    const matchingImages = getCameraManufacturerMatches(tags).map(
        ({ imageName }) => imageName,
    );

    if (matchingImages.length > 1) {
        return GENERIC_ALPR_SYMBOL_IMAGE_NAME;
    }
    if (matchingImages.length === 1) {
        return matchingImages[0];
    }

    return type === 'alpr' || type === 'anpr'
        ? GENERIC_ALPR_SYMBOL_IMAGE_NAME
        : null;
}

export function nodeShowsAlprSymbol(node) {
    return getNodeAlprSymbolImage(node) !== null;
}

export function getMarkerAlprSymbolImage(marker) {
    const osmNodes = marker?.properties?.osm_nodes;

    if (!Array.isArray(osmNodes)) {
        return null;
    }

    const images = [
        ...new Set(osmNodes.map(getNodeAlprSymbolImage).filter(Boolean)),
    ];

    return images.length > 1
        ? GENERIC_ALPR_SYMBOL_IMAGE_NAME
        : (images[0] ?? null);
}

export function markerShowsAlprSymbol(marker) {
    return getMarkerAlprSymbolImage(marker) !== null;
}
