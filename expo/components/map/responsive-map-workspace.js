import { DraftPinMarkers } from '../contribute/contribute-draft-pin-markers';
import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import {
    SafeAreaInsetsOverrideProvider,
    useSafeAreaInsets,
} from '../../lib/safe-area-insets';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
    MAPBOX_STANDARD_STYLE_URL,
} from './config';
import { useMapboxStandardLightPreset } from './use-map-light-preset';
import { makeMarkerFeatureCollection } from './geo';
import { NativeWindMapView } from './native-components';
import {
    useSharedMapLocationState,
    useSharedMapState,
} from './shared-map-state';
import { useResponsiveMapLayout } from './use-responsive-map-layout';

export function WorkspaceMap({
    pins = [],
    removals = [],
    focusCoordinate = null,
}) {
    const {
        initialCameraSettings,
        markerPoints,
        mapStyleURL,
        mapLightPresetPreference,
        surveillanceMarkersVisible,
    } = useSharedMapState();
    const { userLocation } = useSharedMapLocationState();
    const lightPreset = useMapboxStandardLightPreset(
        mapLightPresetPreference,
        userLocation,
    );
    const markers = useMemo(
        () => makeMarkerFeatureCollection(markerPoints),
        [markerPoints],
    );
    const center =
        focusCoordinate ??
        (pins[0]
            ? [pins[0].longitude, pins[0].latitude]
            : userLocation
              ? [userLocation.longitude, userLocation.latitude]
              : null);

    if (!MAPBOX_ACCESS_TOKEN) {
        return (
            <View className="flex-1 items-center justify-center bg-daf-surface-alt dark:bg-daf-surface-inverse">
                <Text className="text-daf-text-secondary dark:text-neutral-300">
                    Map unavailable
                </Text>
            </View>
        );
    }

    return (
        <NativeWindMapView
            className="flex-1"
            styleURL={mapStyleURL || MAPBOX_STANDARD_STYLE_URL}
            surfaceView={false}
            compassEnabled={false}
            scaleBarEnabled={false}
            testID="workspace-map"
        >
            <Mapbox.StyleImport
                existing
                id={MAPBOX_STANDARD_STYLE_IMPORT_ID}
                config={{ lightPreset }}
            />
            <Mapbox.Camera
                defaultSettings={initialCameraSettings}
                {...(center ? { centerCoordinate: center, zoomLevel: 14 } : {})}
            />
            {surveillanceMarkersVisible && markers.features.length > 0 ? (
                <Mapbox.ShapeSource id="workspace-cameras" shape={markers}>
                    <Mapbox.CircleLayer
                        id="workspace-camera-dots"
                        slot="top"
                        style={{
                            circleColor: [
                                'case',
                                ['get', 'showsAlprSymbol'],
                                '#FF4D4F',
                                '#34B3FF',
                            ],
                            circleRadius: 5,
                            circleStrokeColor: '#FFFFFF',
                            circleStrokeWidth: 2,
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            <DraftPinMarkers contributePins={pins} removals={removals} />
        </NativeWindMapView>
    );
}

export function ResponsiveMapWorkspace({ children, map = null }) {
    const layout = useResponsiveMapLayout();
    const insets = useSafeAreaInsets();
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID={layout.isWide ? 'wide-map-workspace' : undefined}
        >
            {layout.isWide ? (
                <View
                    className="absolute inset-0"
                    style={{ left: layout.mapLeftInset }}
                >
                    {map ?? <WorkspaceMap />}
                </View>
            ) : null}
            <View
                className={
                    layout.isWide
                        ? 'absolute z-10 overflow-hidden rounded-dafXl border border-daf-border dark:border-daf-border-dark'
                        : 'flex-1'
                }
                style={
                    layout.isWide
                        ? {
                              left: insets.left + 12,
                              width: layout.paneWidth,
                              top: insets.top + 12,
                              bottom: insets.bottom + 12,
                          }
                        : undefined
                }
                testID={layout.isWide ? 'workspace-left-pane' : undefined}
            >
                <SafeAreaInsetsOverrideProvider
                    insets={
                        layout.isWide
                            ? { top: 0, bottom: 0, left: 0, right: 0 }
                            : insets
                    }
                >
                    {children}
                </SafeAreaInsetsOverrideProvider>
            </View>
        </View>
    );
}
