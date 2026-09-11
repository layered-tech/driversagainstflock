import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import { Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { getBoundsFitCameraStop } from '../map/camera-state';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
    MAPBOX_STANDARD_STYLE_URL,
} from '../map/config';
import { NativeWindMapView } from '../map/native-components';
import {
    getScorecardMapExposures,
    getScorecardMapGeometryBounds,
    makeScorecardExposureConeCollection,
    makeScorecardExposurePointCollection,
    makeScorecardExposureTravelLineCollection,
} from './scorecard-map-data';

const MAP_HORIZONTAL_INSET = 32;

function getCameraSettings(exposures, height, lineCollection, width) {
    const mappedExposures = getScorecardMapExposures(exposures);
    const bounds = getScorecardMapGeometryBounds(
        mappedExposures,
        lineCollection,
    );

    if (bounds) {
        return getBoundsFitCameraStop({
            bounds,
            padding: 48,
            viewportHeight: height,
            viewportWidth: Math.max(1, width - MAP_HORIZONTAL_INSET),
        });
    }

    return mappedExposures[0]
        ? {
              centerCoordinate: mappedExposures[0].cameraCoordinate,
              pitch: 0,
              zoomLevel: 16,
          }
        : null;
}

export function ScorecardExposureMap({
    exposures,
    height,
    lineCollection = null,
    lineColor = '#FF4D4F',
    numbered = false,
    showCones = false,
    testID,
}) {
    const colorScheme = useColorScheme();
    const { width } = useWindowDimensions();
    const mappedExposures = useMemo(
        () => getScorecardMapExposures(exposures),
        [exposures],
    );
    const pointCollection = useMemo(
        () => makeScorecardExposurePointCollection(mappedExposures),
        [mappedExposures],
    );
    const resolvedLineCollection = useMemo(
        () =>
            lineCollection ??
            makeScorecardExposureTravelLineCollection(mappedExposures),
        [lineCollection, mappedExposures],
    );
    const coneCollection = useMemo(
        () => makeScorecardExposureConeCollection(mappedExposures),
        [mappedExposures],
    );
    const cameraSettings = useMemo(
        () =>
            getCameraSettings(
                mappedExposures,
                height,
                resolvedLineCollection,
                width,
            ),
        [height, mappedExposures, resolvedLineCollection, width],
    );
    const styleImportConfig = useMemo(
        () => ({
            lightPreset:
                colorScheme === 'dark'
                    ? MAPBOX_STANDARD_LIGHT_PRESET_NIGHT
                    : MAPBOX_STANDARD_LIGHT_PRESET_DAY,
            showPointOfInterestLabels: true,
            showTransitLabels: false,
        }),
        [colorScheme],
    );
    const emissiveStrength = colorScheme === 'dark' ? 1 : 0;

    if (!MAPBOX_ACCESS_TOKEN) {
        return (
            <View
                className="items-center justify-center bg-daf-surface-alt px-6 dark:bg-daf-surface-inverse"
                style={{ height }}
                testID={`${testID}-unavailable`}
            >
                <Text className="text-center text-sm font-semibold text-daf-text-secondary dark:text-neutral-300">
                    Map unavailable because the Mapbox access token is not
                    configured.
                </Text>
            </View>
        );
    }

    return (
        <NativeWindMapView
            attributionEnabled
            className="w-full"
            compassEnabled={false}
            logoEnabled
            pitchEnabled={false}
            rotateEnabled={false}
            scaleBarEnabled={false}
            style={{ height }}
            styleURL={MAPBOX_STANDARD_STYLE_URL}
            surfaceView={false}
            testID={testID}
        >
            <Mapbox.StyleImport
                config={styleImportConfig}
                existing
                id={MAPBOX_STANDARD_STYLE_IMPORT_ID}
            />
            {cameraSettings ? (
                <Mapbox.Camera defaultSettings={cameraSettings} />
            ) : null}
            {showCones && coneCollection.features.length > 0 ? (
                <Mapbox.ShapeSource
                    id={`${testID}-cones-source`}
                    shape={coneCollection}
                >
                    <Mapbox.FillLayer
                        id={`${testID}-cones-fill`}
                        slot="top"
                        style={{
                            fillColor: [
                                'match',
                                ['get', 'certainty'],
                                'confirmed',
                                '#FF4D4F',
                                '#FFB02E',
                            ],
                            fillEmissiveStrength: emissiveStrength,
                            fillOpacity: 0.24,
                        }}
                    />
                    <Mapbox.LineLayer
                        id={`${testID}-cones-outline`}
                        slot="top"
                        style={{
                            lineColor: [
                                'match',
                                ['get', 'certainty'],
                                'confirmed',
                                '#FF4D4F',
                                '#FFB02E',
                            ],
                            lineEmissiveStrength: emissiveStrength,
                            lineOpacity: 1,
                            lineWidth: 2,
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {resolvedLineCollection.features.length > 0 ? (
                <Mapbox.ShapeSource
                    id={`${testID}-trail-source`}
                    shape={resolvedLineCollection}
                >
                    <Mapbox.LineLayer
                        id={`${testID}-trail-line`}
                        slot="top"
                        style={{
                            lineCap: 'round',
                            lineColor,
                            lineEmissiveStrength: emissiveStrength,
                            lineJoin: 'round',
                            lineOpacity: 1,
                            lineWidth: 4,
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            <Mapbox.ShapeSource
                id={`${testID}-points-source`}
                shape={pointCollection}
            >
                <Mapbox.CircleLayer
                    id={`${testID}-points-circle`}
                    slot="top"
                    style={{
                        circleColor: [
                            'match',
                            ['get', 'certainty'],
                            'confirmed',
                            '#FF4D4F',
                            '#FFB02E',
                        ],
                        circleEmissiveStrength: emissiveStrength,
                        circleRadius: numbered ? 12 : 10,
                        circleStrokeColor: '#FFFFFF',
                        circleStrokeWidth: 3,
                    }}
                />
                {numbered ? (
                    <Mapbox.SymbolLayer
                        id={`${testID}-points-label`}
                        slot="top"
                        style={{
                            textAllowOverlap: true,
                            textColor: '#FFFFFF',
                            textEmissiveStrength: emissiveStrength,
                            textField: ['get', 'sequenceLabel'],
                            textFont: [
                                'DIN Pro Medium',
                                'Arial Unicode MS Regular',
                            ],
                            textSize: 11,
                        }}
                    />
                ) : null}
            </Mapbox.ShapeSource>
        </NativeWindMapView>
    );
}
