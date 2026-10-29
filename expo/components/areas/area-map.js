import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { useDuoRailEdge } from '../root/native-navigation';
import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef } from 'react';
import {
    Platform,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useDuoDevice } from '../root/duo-device-context';
import { getDuoPaneLayout } from '../map/duo-bottom-sheet-layout';
import { getTabletPaneLayout } from '../map/responsive-map-layout';
import { NativeWindMapView } from '../map/native-components';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
    MAPBOX_STANDARD_STYLE_URL,
} from '../map/config';
import { geometryBounds } from './area-geometry';
import { areaCameraSettings } from './area-map-camera';
import { getBoundsFitCameraStop } from '../map/camera-state';
import { areaCameraCones } from './area-camera-cones';

export function AreaMap({
    geometry,
    center,
    changes = [],
    points = [],
    onAddPoint,
    onMovePoint,
    onChangePress,
    fitGeometry = true,
    zoomLevel = 12,
    bottomOverlap = 0,
    sheetHeight = 0,
    overview = false,
    showDirectionCones = false,
}) {
    const camera = useRef(null);
    const insets = useSafeAreaInsets();
    const railEdge = useDuoRailEdge();
    const duoDevice = useDuoDevice();
    const { width, height } = useWindowDimensions();
    const tabletPane = Platform?.isPad
        ? getTabletPaneLayout(width, insets)
        : null;
    const pane =
        tabletPane ?? (duoDevice ? getDuoPaneLayout(width, insets) : null);
    const floatingMap = duoDevice || Boolean(tabletPane);
    const visibleBottomOverlap = pane
        ? 0
        : railEdge
          ? sheetHeight
          : bottomOverlap;
    const dark = useColorScheme() === 'dark';
    const bounds = useMemo(() => geometryBounds(geometry), [geometry]);
    const cameraInsets = pane
        ? { ...insets, left: pane.left + pane.width + 12 }
        : insets;
    const cameraBottomInset = pane ? 0 : railEdge ? sheetHeight : 0;
    function cameraTarget(fit) {
        const settings = areaCameraSettings({
            bounds,
            center,
            fitGeometry: fit,
            zoomLevel,
            insets: cameraInsets,
            bottomInset: cameraBottomInset,
        });
        if (!floatingMap || !settings.bounds) return settings;
        return (
            getBoundsFitCameraStop({
                bounds: settings.bounds,
                padding: [
                    settings.bounds.paddingTop,
                    settings.bounds.paddingRight,
                    settings.bounds.paddingBottom,
                    settings.bounds.paddingLeft,
                ],
                viewportHeight: height,
                viewportWidth: width,
            }) ?? settings
        );
    }
    const target = cameraTarget(fitGeometry);
    const resizedTarget = floatingMap && bounds ? cameraTarget(true) : target;
    const targetKey = JSON.stringify(target);
    const initialCamera = useRef(target);
    const previousTarget = useRef(targetKey);
    useEffect(() => {
        if (previousTarget.current === targetKey) return;
        previousTarget.current = targetKey;
        camera.current?.setCamera({ ...target, animationDuration: 350 });
    }, [target, targetKey]);
    const collection = useMemo(
        () => ({
            type: 'FeatureCollection',
            features: changes.map((change) => ({
                type: 'Feature',
                id: change.id,
                properties: { id: change.id, kind: change.kind },
                geometry: {
                    type: 'Point',
                    coordinates: [change.longitude, change.latitude],
                },
            })),
        }),
        [changes],
    );
    const cones = useMemo(
        () => areaCameraCones(showDirectionCones && floatingMap ? changes : []),
        [changes, floatingMap, showDirectionCones],
    );
    if (!MAPBOX_ACCESS_TOKEN)
        return (
            <View className="flex-1 items-center justify-center bg-daf-surface-alt">
                <Text>Map unavailable.</Text>
            </View>
        );
    return (
        <NativeWindMapView
            className="flex-1"
            styleURL={MAPBOX_STANDARD_STYLE_URL}
            surfaceView={false}
            scaleBarEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            onLayout={
                floatingMap
                    ? () =>
                          camera.current?.setCamera({
                              ...resizedTarget,
                              animationDuration: 0,
                          })
                    : undefined
            }
            logoPosition={
                pane
                    ? { left: pane.left + pane.width + 12, bottom: 8 }
                    : visibleBottomOverlap
                      ? { bottom: visibleBottomOverlap + 8, left: 8 }
                      : undefined
            }
            attributionPosition={
                pane
                    ? { left: pane.left + pane.width + 108, bottom: 8 }
                    : visibleBottomOverlap
                      ? { bottom: visibleBottomOverlap + 8, left: 96 }
                      : undefined
            }
            onPress={
                onAddPoint
                    ? (event) => {
                          if (event.geometry?.type === 'Point')
                              onAddPoint(event.geometry.coordinates);
                      }
                    : undefined
            }
        >
            <Mapbox.StyleImport
                id={MAPBOX_STANDARD_STYLE_IMPORT_ID}
                existing
                config={{
                    lightPreset: dark ? 'night' : 'day',
                    showPointOfInterestLabels: false,
                    showTransitLabels: false,
                }}
            />
            <Mapbox.Camera
                ref={camera}
                defaultSettings={initialCamera.current}
            />
            {geometry ? (
                <Mapbox.ShapeSource
                    id="area-boundary"
                    shape={{ type: 'Feature', properties: {}, geometry }}
                >
                    <Mapbox.FillLayer
                        id="area-fill"
                        style={{
                            fillColor: '#1FBF6B',
                            fillEmissiveStrength: 1,
                            fillOpacity: overview ? 0.1 : 0.16,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="area-outline"
                        style={{
                            lineColor: '#1FBF6B',
                            lineEmissiveStrength: 1,
                            lineWidth: 2,
                            ...(overview ? {} : { lineDasharray: [3, 2] }),
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {points.length >= 2 && !geometry ? (
                <Mapbox.ShapeSource
                    id="area-drawing"
                    shape={{
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'LineString', coordinates: points },
                    }}
                >
                    <Mapbox.LineLayer
                        id="area-drawing-line"
                        style={{
                            lineColor: '#1FBF6B',
                            lineWidth: 2,
                            lineEmissiveStrength: 1,
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {points.map((point, index) => (
                <Mapbox.PointAnnotation
                    key={index}
                    id={`area-corner-${index}`}
                    coordinate={point}
                    draggable
                    onDragEnd={(event) =>
                        onMovePoint?.(index, event.geometry.coordinates)
                    }
                >
                    <View className="h-4 w-4 rounded-full border-2 border-daf-brand bg-white" />
                </Mapbox.PointAnnotation>
            ))}
            {cones.features.length ? (
                <Mapbox.ShapeSource id="area-camera-directions" shape={cones}>
                    <Mapbox.FillLayer
                        id="area-camera-cones"
                        style={{
                            fillColor: '#FF4D4F',
                            fillOpacity: 0.2,
                            fillEmissiveStrength: 1,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="area-camera-cone-borders"
                        style={{
                            lineColor: '#FF4D4F',
                            lineOpacity: 0.45,
                            lineWidth: 1,
                            lineEmissiveStrength: 1,
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {showDirectionCones && floatingMap
                ? changes
                      .filter((change) => change.kind === 'added')
                      .map((change) => (
                          <Mapbox.MarkerView
                              key={`new-${change.id}`}
                              id={`area-camera-new-${change.id}`}
                              coordinate={[change.longitude, change.latitude]}
                              anchor={{ x: 0.5, y: 1.8 }}
                          >
                              <View className="rounded-dafPill bg-daf-alert px-[8px] py-[4px]">
                                  <Text className="font-dafMono text-[10px] font-bold text-white">
                                      NEW
                                  </Text>
                              </View>
                          </Mapbox.MarkerView>
                      ))
                : null}
            <Mapbox.ShapeSource
                id="area-changes"
                shape={collection}
                onPress={(event) =>
                    onChangePress?.(event.features[0]?.properties?.id)
                }
            >
                {overview ? (
                    <Mapbox.CircleLayer
                        id="area-change-halos"
                        style={{
                            circleRadius: 12,
                            circleColor: '#FF4D4F',
                            circleEmissiveStrength: 1,
                            circleBlur: 0.6,
                            circleOpacity: [
                                'match',
                                ['get', 'kind'],
                                'removed',
                                0.2,
                                0.55,
                            ],
                        }}
                    />
                ) : null}
                <Mapbox.CircleLayer
                    id="area-change-circles"
                    style={{
                        circleRadius: [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            8,
                            3,
                            12,
                            4,
                            16,
                            8,
                        ],
                        circleColor: overview
                            ? '#FF4D4F'
                            : [
                                  'match',
                                  ['get', 'kind'],
                                  'removed',
                                  '#1FBF6B',
                                  '#FF4D4F',
                              ],
                        circleStrokeColor: '#FFFFFF',
                        circleEmissiveStrength: 1,
                        circleStrokeWidth: 1.5,
                        ...(overview
                            ? {
                                  circleRadius: 5,
                                  circleOpacity: [
                                      'match',
                                      ['get', 'kind'],
                                      'removed',
                                      0.45,
                                      1,
                                  ],
                                  circleStrokeOpacity: [
                                      'match',
                                      ['get', 'kind'],
                                      'removed',
                                      0.45,
                                      1,
                                  ],
                              }
                            : {}),
                    }}
                />
            </Mapbox.ShapeSource>
        </NativeWindMapView>
    );
}
