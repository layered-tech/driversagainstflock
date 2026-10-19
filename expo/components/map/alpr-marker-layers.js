import Mapbox from '@rnmapbox/maps';
import {
    ALPR_SYMBOL_ICON_OFFSETS,
    ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
    ALPR_SYMBOL_IMAGE_PROPERTY_NAME,
    ALPR_SYMBOL_IMAGE_SCALE,
    ALPR_SYMBOL_MIN_ZOOM_LEVEL,
    ALPR_SYMBOL_VISIBLE_PROPERTY_NAME,
    INDIVIDUAL_MARKER_FILTER,
} from './constants';

export function renderAlprMarkerLayers({
    aboveLayerID,
    idPrefix,
    sourceID,
    slot,
}) {
    return Object.entries(ALPR_SYMBOL_ICON_OFFSETS).map(
        ([imageName, offset]) => (
            <Mapbox.SymbolLayer
                key={`${idPrefix}-${imageName}`}
                id={`${idPrefix}-${imageName}`}
                aboveLayerID={aboveLayerID}
                sourceID={sourceID}
                filter={[
                    'all',
                    INDIVIDUAL_MARKER_FILTER,
                    ['==', ['get', ALPR_SYMBOL_VISIBLE_PROPERTY_NAME], true],
                    ['==', ['get', ALPR_SYMBOL_IMAGE_PROPERTY_NAME], imageName],
                ]}
                minZoomLevel={ALPR_SYMBOL_MIN_ZOOM_LEVEL}
                slot={slot}
                style={{
                    iconAllowOverlap: true,
                    iconAnchor: 'bottom',
                    iconIgnorePlacement: true,
                    iconOcclusionOpacity: 1,
                    iconImage: imageName,
                    iconOffset: offset.map(
                        (value) => value / ALPR_SYMBOL_IMAGE_SCALE,
                    ),
                    iconPitchAlignment: 'viewport',
                    iconRotationAlignment: 'viewport',
                    iconTextFit: 'none',
                    iconSize: ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
                }}
            />
        ),
    );
}
