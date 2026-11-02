import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef } from 'react';
import {
    Platform,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { DuoText as Text } from '../design-system/duo-typography';
import { useDuoDevice } from '../root/duo-device-context';
import { getBoundsFitCameraStop } from '../map/camera-state';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
    MAPBOX_STANDARD_STYLE_URL,
} from '../map/config';
import { NativeWindMapView } from '../map/native-components';
import { getScorecardExposureMapData } from './scorecard-map-data';

const MAP_HORIZONTAL_INSET = 32;

function getCameraSettings(
    { bounds, mappedExposures },
    height,
    width,
    cameraPadding,
    fullViewport,
) {
    if (bounds) {
        return getBoundsFitCameraStop({
            bounds,
            padding: cameraPadding ?? 48,
            viewportHeight: height,
            viewportWidth: Math.max(
                1,
                width - (fullViewport ? 0 : MAP_HORIZONTAL_INSET),
            ),
        });
    }

    return mappedExposures[0]
        ? {
              centerCoordinate: mappedExposures[0].cameraCoordinate,
              pitch: 0,
              zoomLevel: 16,
              ...(cameraPadding
                  ? {
                        padding: {
                            paddingTop: cameraPadding[0],
                            paddingRight: cameraPadding[1],
                            paddingBottom: cameraPadding[2],
                            paddingLeft: cameraPadding[3],
                        },
                    }
                  : {}),
          }
        : null;
}

export function ScorecardExposureMap({
    exposures,
    height,
    cameraPadding,
    fullViewport = false,
    persistent = fullViewport,
    lineCollection = null,
    lineColor = '#FF4D4F',
    numbered = false,
    showCones = false,
    testID,
}) {
    const colorScheme = useColorScheme();
    const duoDevice = useDuoDevice();
    const { width } = useWindowDimensions();
    const duo = duoDevice || (Boolean(Platform?.isPad) && width >= 768);
    const mapData = useMemo(
        () =>
            getScorecardExposureMapData(exposures, {
                lineCollection,
                showCones,
            }),
        [exposures, lineCollection, showCones],
    );
    const {
        coneCollection,
        lineCollection: resolvedLineCollection,
        pointCollection,
        mappedExposures,
    } = mapData;
    const cameraSettings = useMemo(
        () =>
            getCameraSettings(
                mapData,
                height,
                width,
                cameraPadding,
                fullViewport,
            ),
        [height, mapData, width, cameraPadding, fullViewport],
    );
    const camera = useRef(null);
    const initialCamera = useRef(cameraSettings);
    useEffect(() => {
        if (cameraSettings) camera.current?.setCamera(cameraSettings);
    }, [cameraSettings]);
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
            persistent={duo && persistent}
            attributionEnabled
            className="w-full"
            compassEnabled={false}
            logoEnabled
            pitchEnabled={false}
            rotateEnabled={false}
            scaleBarEnabled={false}
            style={{ height }}
            onLayout={() => {
                if (cameraSettings) camera.current?.setCamera(cameraSettings);
            }}
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
                <Mapbox.Camera
                    ref={camera}
                    defaultSettings={initialCamera.current}
                />
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
                            lineWidth: numbered && duo ? 2 : 4,
                            ...(numbered && duo
                                ? { lineDasharray: [3, 3] }
                                : {}),
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
            {numbered && duo
                ? mappedExposures
                      .filter((exposure) =>
                          Number.isFinite(exposure.occurredAt),
                      )
                      .map((exposure) => (
                          <Mapbox.MarkerView
                              key={`capture-time-${exposure.id}`}
                              id={`capture-time-${exposure.id}`}
                              coordinate={exposure.cameraCoordinate}
                              anchor={{ x: 0.5, y: 0 }}
                              allowOverlap
                          >
                              <View className="pt-4">
                                  <Text className="rounded-full bg-white px-2 py-0.5 font-dafMono text-[10px] font-semibold text-daf-text-primary dark:bg-[#11151B] dark:text-white">
                                      {new Intl.DateTimeFormat(undefined, {
                                          weekday: 'short',
                                          hour: 'numeric',
                                          minute: '2-digit',
                                      }).format(new Date(exposure.occurredAt))}
                                  </Text>
                              </View>
                          </Mapbox.MarkerView>
                      ))
                : null}
        </NativeWindMapView>
    );
}
