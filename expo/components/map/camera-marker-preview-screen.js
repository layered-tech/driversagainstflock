import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Mapbox from '@rnmapbox/maps';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { CAMERA_PRESETS, getPresetTags } from '../../lib/osm/camera-presets';
import { DafButton, DafChip } from '../design-system/primitives';
import { AlprMarkerImages, MarkerConeImages } from './map-assets';
import { MAPBOX_STANDARD_STYLE_URL } from './config';
import { MAX_ZOOM_LEVEL } from './constants';
import { makeMarkerFeatureCollection } from './geo';
import { renderMarkerConeLayers, renderMarkerPointLayers } from './map-canvas';

const PRESETS = CAMERA_PRESETS.filter(({ value }) => value !== 'custom');
const ZOOM_LEVELS = [...new Set([15, 16, 18, 20, MAX_ZOOM_LEVEL])].filter(
    (zoom) => zoom <= MAX_ZOOM_LEVEL,
);
const COORDINATE = [-88.1636862, 43.0356551];
const PALETTE = { markerFill: '#ef4444', markerStroke: '#ffffff' };

export function CameraMarkerPreviewScreen({ initialPreset, onClose } = {}) {
    const router = useRouter();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const requestedPreset = initialPreset ?? params.preset;
    const [preset, setPreset] = useState(
        PRESETS.some(({ value }) => value === requestedPreset)
            ? requestedPreset
            : 'axon',
    );
    const [zoom, setZoom] = useState(18);
    const [direction, setDirection] = useState(180);
    const [pitch, setPitch] = useState(0);
    const tags = useMemo(
        () => ({
            ...getPresetTags(preset),
            'camera:direction': String(direction),
        }),
        [preset, direction],
    );
    const shape = useMemo(
        () =>
            makeMarkerFeatureCollection([
                {
                    location: COORDINATE,
                    properties: { id: 'preview', osm_nodes: [{ tags }] },
                },
            ]),
        [tags],
    );
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-daf-surface-dark"
            style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
            testID="camera-marker-preview-screen"
        >
            <View className="gap-2 px-4 py-2">
                <DafButton
                    variant="secondary"
                    onPress={onClose ?? (() => router.back())}
                >
                    Close preview
                </DafButton>
                <Text className="text-lg font-bold text-daf-text-primary dark:text-white">
                    Camera marker preview
                </Text>
                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                    Sample marker only. The red dot is the node and cone origin.
                    Nothing is submitted to OpenStreetMap.
                </Text>
                <ScrollView
                    horizontal
                    className="h-10 flex-grow-0"
                    testID="marker-preview-brands"
                >
                    <View className="flex-row gap-2">
                        {PRESETS.map((item) => (
                            <DafChip
                                key={item.value}
                                selected={preset === item.value}
                                onPress={() => setPreset(item.value)}
                                testID={`marker-preview-${item.value}`}
                            >
                                {item.label}
                            </DafChip>
                        ))}
                    </View>
                </ScrollView>
                <View className="flex-row flex-wrap gap-2">
                    {ZOOM_LEVELS.map((value) => (
                        <DafChip
                            key={value}
                            selected={zoom === value}
                            onPress={() => setZoom(value)}
                        >
                            Zoom {value}
                        </DafChip>
                    ))}
                    <DafChip
                        selected={pitch === 45}
                        onPress={() => setPitch(pitch ? 0 : 45)}
                    >
                        Tilt
                    </DafChip>
                    <DafChip
                        onPress={() => setDirection((direction + 90) % 360)}
                    >
                        Cone {direction}°
                    </DafChip>
                </View>
                <Text
                    className="font-dafMono text-xs text-daf-text-secondary dark:text-neutral-300"
                    testID="marker-preview-tags"
                >
                    {Object.entries(getPresetTags(preset))
                        .map(([key, value]) => `${key}=${value}`)
                        .join('\n')}
                </Text>
            </View>
            <View className="flex-1">
                <Mapbox.MapView
                    style={{ flex: 1 }}
                    styleURL={MAPBOX_STANDARD_STYLE_URL}
                    testID="marker-preview-map"
                >
                    <Mapbox.Camera
                        centerCoordinate={COORDINATE}
                        zoomLevel={zoom}
                        pitch={pitch}
                        heading={0}
                        animationDuration={0}
                    />
                    <AlprMarkerImages />
                    <MarkerConeImages />
                    <Mapbox.ShapeSource id="marker-preview" shape={shape}>
                        {renderMarkerConeLayers({
                            idPrefix: 'marker-preview',
                            sourceID: 'marker-preview',
                            visible: true,
                            slot: 'top',
                        })}
                        {renderMarkerPointLayers({
                            idPrefix: 'marker-preview',
                            sourceID: 'marker-preview',
                            emissiveStrength: 0,
                            mapRoutePalette: PALETTE,
                            slot: 'top',
                        })}
                        <Mapbox.CircleLayer
                            id="marker-preview-origin"
                            slot="top"
                            style={{
                                circleRadius: 3,
                                circleColor: '#ef4444',
                                circleStrokeWidth: 1,
                                circleStrokeColor: '#ffffff',
                            }}
                        />
                    </Mapbox.ShapeSource>
                </Mapbox.MapView>
            </View>
        </View>
    );
}
