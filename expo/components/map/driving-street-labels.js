import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useStableCurrentRoadText } from './current-road-context';
import { getDrivingStreetLabelFilter } from './driving-street-label-filter';

const STREET_LABEL_IMAGE_PREFIX = 'driving-street-label-background';
const STREET_LABEL_IMAGE_SCALE = 3;
// The bundled PNGs are 96 × 84 pixels for a 32 × 28 point pill.
// RNMapbox scales these coordinates on iOS. Android consumes image pixels.
const edgeScale = Platform.OS === 'android' ? STREET_LABEL_IMAGE_SCALE : 1;
const streetLabelImageMetadata = {
    scale: STREET_LABEL_IMAGE_SCALE,
    stretchX: [[13 * edgeScale, 19 * edgeScale]],
    stretchY: [[13 * edgeScale, 15 * edgeScale]],
    content: [0, 0, 32 * edgeScale, 28 * edgeScale],
};
const STREET_LABEL_IMAGES = {
    [`${STREET_LABEL_IMAGE_PREFIX}-light`]: {
        ...streetLabelImageMetadata,
        image: require('../../assets/map/driving-street-label-light.png'),
    },
    [`${STREET_LABEL_IMAGE_PREFIX}-dark`]: {
        ...streetLabelImageMetadata,
        image: require('../../assets/map/driving-street-label-dark.png'),
    },
};

const STREET_LABEL_STYLE = {
    iconEmissiveStrength: 1,
    iconOcclusionOpacity: 1,
    iconPitchAlignment: 'viewport',
    iconRotationAlignment: 'viewport',
    iconTextFit: 'width',
    // Text-fit padding includes the transparent shadow margin at each end.
    iconTextFitPadding: [0, 10, 0, 10],
    symbolPlacement: 'line',
    symbolSpacing: 300,
    textEmissiveStrength: 1,
    textField: ['coalesce', ['get', 'name_en'], ['get', 'name']],
    textFont: ['Arial Unicode MS Bold'],
    textOcclusionOpacity: 1,
    textPadding: 3,
    textPitchAlignment: 'viewport',
    textRotationAlignment: 'viewport',
    textSize: 11,
};

export function DrivingStreetLabels({ isDarkMap, userLocation }) {
    const currentRoadText = useStableCurrentRoadText(userLocation);
    const filter = useMemo(
        () => getDrivingStreetLabelFilter(currentRoadText),
        [currentRoadText],
    );
    const style = useMemo(
        () => ({
            ...STREET_LABEL_STYLE,
            iconImage: `${STREET_LABEL_IMAGE_PREFIX}-${isDarkMap ? 'dark' : 'light'}`,
            textColor: isDarkMap ? '#F0F2F5' : '#303640',
        }),
        [isDarkMap],
    );

    return (
        <>
            <Mapbox.Images images={STREET_LABEL_IMAGES} />
            <Mapbox.VectorSource
                id="driving-street-names"
                url="mapbox://mapbox.mapbox-streets-v8"
            >
                <Mapbox.SymbolLayer
                    id="driving-street-labels"
                    filter={filter}
                    minZoomLevel={14}
                    slot="top"
                    sourceLayerID="road"
                    style={style}
                />
            </Mapbox.VectorSource>
        </>
    );
}
