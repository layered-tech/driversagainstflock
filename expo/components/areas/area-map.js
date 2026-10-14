import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { NativeWindMapView } from '../map/native-components';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
    MAPBOX_STANDARD_STYLE_URL,
} from '../map/config';
import { geometryBounds } from './area-geometry';

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
}) {
    const camera = useRef(null);
    const dark = useColorScheme() === 'dark';
    const bounds = useMemo(() => geometryBounds(geometry), [geometry]);
    useEffect(() => {
        if (bounds && fitGeometry)
            camera.current?.fitBounds(
                [bounds[2], bounds[3]],
                [bounds[0], bounds[1]],
                40,
                350,
            );
    }, [bounds, fitGeometry]);
    useEffect(() => {
        if (center && (!bounds || !fitGeometry))
            camera.current?.setCamera({
                centerCoordinate: center,
                zoomLevel,
                animationDuration: 350,
            });
    }, [center?.[0], center?.[1], zoomLevel]);
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
                defaultSettings={
                    center
                        ? { centerCoordinate: center, zoomLevel }
                        : bounds
                          ? {
                                bounds: {
                                    ne: [bounds[2], bounds[3]],
                                    sw: [bounds[0], bounds[1]],
                                    paddingTop: 40,
                                    paddingBottom: 40,
                                    paddingLeft: 40,
                                    paddingRight: 40,
                                },
                            }
                          : { centerCoordinate: [-98.5, 39.5], zoomLevel: 3 }
                }
            />
            {geometry ? (
                <Mapbox.ShapeSource
                    id="area-boundary"
                    shape={{ type: 'Feature', properties: {}, geometry }}
                >
                    <Mapbox.FillLayer
                        id="area-fill"
                        style={{ fillColor: '#1FBF6B', fillOpacity: 0.16 }}
                    />
                    <Mapbox.LineLayer
                        id="area-outline"
                        style={{
                            lineColor: '#1FBF6B',
                            lineWidth: 2,
                            lineDasharray: [3, 2],
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
                        style={{ lineColor: '#1FBF6B', lineWidth: 2 }}
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
            <Mapbox.ShapeSource
                id="area-changes"
                shape={collection}
                onPress={(event) =>
                    onChangePress?.(event.features[0]?.properties?.id)
                }
            >
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
                        circleColor: [
                            'match',
                            ['get', 'kind'],
                            'removed',
                            '#1FBF6B',
                            '#FF4D4F',
                        ],
                        circleStrokeColor: '#FFFFFF',
                        circleStrokeWidth: 1.5,
                    }}
                />
            </Mapbox.ShapeSource>
        </NativeWindMapView>
    );
}
