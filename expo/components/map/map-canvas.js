import Mapbox from '@rnmapbox/maps';
import { memo, useMemo } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    Text,
    View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
    getMockMarkerPointsSnapshot,
    mapApiMocksAreEnabled,
} from './api-mocks';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
    MAPBOX_TRAFFIC_SOURCE_ID,
    MAPBOX_TRAFFIC_SOURCE_LAYER_ID,
    MAPBOX_TRAFFIC_SOURCE_URL,
} from './config';
import {
    ALPR_SYMBOL_ICON_OFFSET,
    ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
    ALPR_SYMBOL_IMAGE_NAME,
    ALPR_SYMBOL_MIN_ZOOM_LEVEL,
    ALPR_SYMBOL_VISIBLE_PROPERTY_NAME,
    ANDROID_AUTO_NAVIGATION_PUCK_BEARING_IMAGE,
    ANDROID_AUTO_NAVIGATION_PUCK_SHADOW_IMAGE,
    INDIVIDUAL_MARKER_FILTER,
    MARKER_CLUSTER_CIRCLE_RADIUS_EXPRESSION,
    MARKER_CLUSTER_FILTER,
    MARKER_CLUSTER_MAX_ZOOM_LEVEL,
    MARKER_CLUSTER_RADIUS,
    MARKER_CONE_DIRECTION_PROPERTY_NAMES,
    MARKER_CONE_ZOOM_STYLES,
    MARKER_DOT_RADIUS_EXPRESSION,
    MARKER_DOT_STROKE_WIDTH_EXPRESSION,
    MAX_ZOOM_LEVEL,
    MIN_ZOOM_LEVEL,
    NAVIGATION_PUCK_BEARING_IMAGE,
    NAVIGATION_PUCK_SHADOW_IMAGE,
    NAVIGATION_PUCK_TOP_TRANSPARENT_IMAGE,
    POLICE_ALERT_GENERIC_IMAGE,
    POLICE_ALERT_HIDING_IMAGE,
    POLICE_ALERT_HIDING_SUBTYPE,
} from './constants';
import {
    DIRECTIONS_DEBUG_AVOID_POLYGONS,
    DIRECTIONS_DEBUG_DESTINATION_LINE,
    DIRECTIONS_DEBUG_ENDPOINT_BUFFERS,
    DIRECTIONS_DEBUG_SEARCH_ZONE,
} from './directions';
import { DrivingLocationProvider } from './driving-location-provider';
import { getMarkerCoordinate } from './geo';
import {
    shouldShowNavigationPuck,
    shouldUseAutoPlayNavigationPuckImages,
} from './location-puck-state';
import {
    AlprMarkerImages,
    MarkerConeImages,
    NavigationPuckImages,
    PoliceAlertImages,
} from './map-assets';
import {
    E2EMarkerTapTarget,
    getCoordinateKey,
    RouteWaypointMarker,
    SubmittedSearchResultMarker,
} from './map-marker-views';
import {
    useMapCanvasContext,
    useMapLocationContext,
    usePlaceSheetContext,
} from './map-screen-context';
import { NativeWindMapView } from './native-components';

const MAP_PREFERRED_FRAMES_PER_SECOND = 30;

function MapLocationProvider({ isDrivingMode, usesSharedLocationProvider }) {
    const { userLocation } = useMapLocationContext();

    return (
        <DrivingLocationProvider
            enabled={isDrivingMode || usesSharedLocationProvider}
            isDrivingMode={isDrivingMode}
            userLocation={userLocation}
        />
    );
}

function buildConeIconImageExpression() {
    const [defaultStyle, ...zoomStyles] = MARKER_CONE_ZOOM_STYLES;

    if (!defaultStyle) {
        return '';
    }

    if (zoomStyles.length === 0) {
        return defaultStyle.imageName;
    }

    return zoomStyles.reduce(
        (expression, coneStyle) => [
            ...expression,
            coneStyle.minZoom,
            coneStyle.imageName,
        ],
        ['step', ['zoom'], defaultStyle.imageName],
    );
}

const MARKER_CONE_ICON_IMAGE_EXPRESSION = buildConeIconImageExpression();
const TRAFFIC_CONGESTION_COLOR_EXPRESSION = [
    'match',
    ['get', 'congestion'],
    'low',
    '#1FBF6B',
    'moderate',
    '#FFB02E',
    'heavy',
    '#FFB02E',
    'severe',
    '#FF4D4F',
    '#5A6573',
];
const TRAFFIC_LINE_WIDTH_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    6,
    1.25,
    10,
    2,
    14,
    4,
    18,
    8,
];
// Mapbox Traffic encodes opposing directions as opposite line geometry directions;
// a positive offset separates both directions on two-way roads.
const TRAFFIC_DIRECTION_LINE_OFFSET_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    6,
    0.5,
    10,
    1,
    14,
    2,
    18,
    4,
];
const TRAFFIC_OPEN_ROADS_FILTER = ['!=', ['get', 'closed'], 'yes'];
const TRAFFIC_CLOSED_ROADS_FILTER = ['==', ['get', 'closed'], 'yes'];
const MAPBOX_STANDARD_DRIVING_BASEMAP_CONFIG = {
    densityPointOfInterestLabels: 1,
    showPlaceLabels: true,
    showPointOfInterestLabels: true,
    showRoadLabels: true,
    showTransitLabels: false,
};
const ALPR_SYMBOL_FILTER = [
    'all',
    INDIVIDUAL_MARKER_FILTER,
    ['==', ['get', ALPR_SYMBOL_VISIBLE_PROPERTY_NAME], true],
];
const MARKER_WITHOUT_ALPR_SYMBOL_FILTER = [
    'all',
    INDIVIDUAL_MARKER_FILTER,
    ['!=', ['get', ALPR_SYMBOL_VISIBLE_PROPERTY_NAME], true],
];
const MARKER_DOT_BASE_LAYER_STYLE = {
    circleOpacity: 1,
    circlePitchAlignment: 'viewport',
    circleRadius: MARKER_DOT_RADIUS_EXPRESSION,
    circleStrokeOpacity: 1,
    circleStrokeWidth: MARKER_DOT_STROKE_WIDTH_EXPRESSION,
};
// Waze police reports render as blue badge icons so they read apart from the
// red surveillance markers at every zoom level. Hidden police (speed traps)
// swap to the badge-behind-a-bush variant.
const POLICE_ALERT_HALO_LAYER_STYLE = {
    circleColor: '#2E8BFF',
    circleOpacity: 0.18,
    circlePitchAlignment: 'viewport',
    circleRadius: [
        'interpolate',
        ['linear'],
        ['zoom'],
        1,
        14,
        8,
        16,
        13,
        18,
        17,
        21,
    ],
};
const POLICE_ALERT_ICON_IMAGE_EXPRESSION = [
    'match',
    ['get', 'subtype'],
    POLICE_ALERT_HIDING_SUBTYPE,
    POLICE_ALERT_HIDING_IMAGE,
    POLICE_ALERT_GENERIC_IMAGE,
];
const POLICE_ALERT_ICON_SIZE_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    0.42,
    8,
    0.5,
    13,
    0.6,
    17,
    0.7,
    MAX_ZOOM_LEVEL,
    0.78,
];
const POLICE_ALERT_SYMBOL_LAYER_STYLE = {
    iconAllowOverlap: true,
    iconIgnorePlacement: true,
    iconImage: POLICE_ALERT_ICON_IMAGE_EXPRESSION,
    iconPitchAlignment: 'viewport',
    iconRotationAlignment: 'viewport',
    iconSize: POLICE_ALERT_ICON_SIZE_EXPRESSION,
};
const DIRECTIONS_DEBUG_AVOID_POLYGONS_FILTER = [
    '==',
    ['get', 'debugRole'],
    DIRECTIONS_DEBUG_AVOID_POLYGONS,
];
const DIRECTIONS_DEBUG_DESTINATION_LINE_FILTER = [
    '==',
    ['get', 'debugRole'],
    DIRECTIONS_DEBUG_DESTINATION_LINE,
];
const DIRECTIONS_DEBUG_ENDPOINT_BUFFERS_FILTER = [
    '==',
    ['get', 'debugRole'],
    DIRECTIONS_DEBUG_ENDPOINT_BUFFERS,
];
const DIRECTIONS_DEBUG_SEARCH_ZONE_FILTER = [
    '==',
    ['get', 'debugRole'],
    DIRECTIONS_DEBUG_SEARCH_ZONE,
];
const SELECTED_DIRECTIONS_ROUTE_FILTER = ['==', ['get', 'selected'], true];
const ALTERNATE_DIRECTIONS_ROUTE_FILTER = ['!=', ['get', 'selected'], true];
const CAMERA_CONE_HIDDEN_FILTER = ['==', ['get', '__cameraConeVisible'], true];
const MAP_ROUTE_PALETTES = {
    light: {
        alternateCasing: '#ffffff',
        alternateLine: '#A9B2BD',
        clusterFill: '#FF4D4F',
        clusterStroke: '#E5383B',
        clusterText: '#ffffff',
        directLine: '#2E8BFF',
        idealLine: '#1FBF6B',
        markerFill: '#FF4D4F',
        markerStroke: '#ffffff',
        selectedCasing: '#ffffff',
    },
    duskNight: {
        alternateCasing: '#0B0E12',
        alternateLine: '#828D9B',
        clusterFill: '#FF4D4F',
        clusterStroke: '#FFDCDC',
        clusterText: '#ffffff',
        directLine: '#2E8BFF',
        idealLine: '#1FBF6B',
        markerFill: '#FF4D4F',
        markerStroke: '#FFDCDC',
        selectedCasing: '#0B0E12',
    },
};
function makeSelectedDirectionsRouteColorExpression(palette) {
    return [
        'match',
        ['get', 'routeKey'],
        'ideal',
        palette.idealLine,
        'direct',
        palette.directLine,
        palette.directLine,
    ];
}

function makeMarkerConeFilter(directionProperty, visible) {
    if (!visible) {
        return CAMERA_CONE_HIDDEN_FILTER;
    }

    return ['all', INDIVIDUAL_MARKER_FILTER, ['has', directionProperty]];
}

function renderMarkerConeLayers({ idPrefix, sourceID, visible }) {
    return MARKER_CONE_DIRECTION_PROPERTY_NAMES.map((directionProperty) => (
        <Mapbox.SymbolLayer
            key={`${idPrefix}-cone-${directionProperty}`}
            id={`${idPrefix}-cone-${directionProperty}`}
            sourceID={sourceID}
            filter={makeMarkerConeFilter(directionProperty, visible)}
            style={{
                iconAllowOverlap: true,
                iconAnchor: 'center',
                iconIgnorePlacement: true,
                iconImage: MARKER_CONE_ICON_IMAGE_EXPRESSION,
                iconPitchAlignment: 'map',
                iconRotate: ['get', directionProperty],
                iconRotationAlignment: 'map',
            }}
        />
    ));
}

function renderMarkerClusterLayers({
    emissiveStrength,
    idPrefix,
    mapRoutePalette,
    sourceID,
}) {
    return [
        <Mapbox.CircleLayer
            key={`${idPrefix}-clusters`}
            id={`${idPrefix}-clusters`}
            sourceID={sourceID}
            filter={MARKER_CLUSTER_FILTER}
            style={{
                circleColor: mapRoutePalette.clusterFill,
                circleEmissiveStrength: emissiveStrength,
                circleOpacity: 0.5,
                circlePitchAlignment: 'viewport',
                circleRadius: MARKER_CLUSTER_CIRCLE_RADIUS_EXPRESSION,
                circleStrokeColor: mapRoutePalette.clusterStroke,
                circleStrokeOpacity: 1,
                circleStrokeWidth: 2.5,
            }}
        />,
        <Mapbox.SymbolLayer
            key={`${idPrefix}-cluster-count`}
            id={`${idPrefix}-cluster-count`}
            sourceID={sourceID}
            filter={MARKER_CLUSTER_FILTER}
            style={{
                textAllowOverlap: true,
                textColor: mapRoutePalette.clusterText,
                textEmissiveStrength: emissiveStrength,
                textField: ['get', 'point_count_abbreviated'],
                textFont: ['Arial Unicode MS Bold'],
                textIgnorePlacement: true,
                textPitchAlignment: 'viewport',
                textSize: 14,
            }}
        />,
    ];
}

function renderMarkerPointLayers({
    emissiveStrength,
    idPrefix,
    mapRoutePalette,
    sourceID,
}) {
    const markerDotLayerStyle = {
        ...MARKER_DOT_BASE_LAYER_STYLE,
        circleColor: mapRoutePalette.markerFill,
        circleEmissiveStrength: emissiveStrength,
        circleStrokeColor: mapRoutePalette.markerStroke,
    };

    return [
        <Mapbox.CircleLayer
            key={`${idPrefix}-markers`}
            id={`${idPrefix}-markers`}
            sourceID={sourceID}
            filter={INDIVIDUAL_MARKER_FILTER}
            maxZoomLevel={ALPR_SYMBOL_MIN_ZOOM_LEVEL}
            style={markerDotLayerStyle}
        />,
        <Mapbox.CircleLayer
            key={`${idPrefix}-markers-without-alpr-symbols`}
            id={`${idPrefix}-markers-without-alpr-symbols`}
            sourceID={sourceID}
            filter={MARKER_WITHOUT_ALPR_SYMBOL_FILTER}
            minZoomLevel={ALPR_SYMBOL_MIN_ZOOM_LEVEL}
            style={markerDotLayerStyle}
        />,
        <Mapbox.SymbolLayer
            key={`${idPrefix}-marker-alpr-symbols`}
            id={`${idPrefix}-marker-alpr-symbols`}
            sourceID={sourceID}
            filter={ALPR_SYMBOL_FILTER}
            minZoomLevel={ALPR_SYMBOL_MIN_ZOOM_LEVEL}
            style={{
                iconAllowOverlap: true,
                iconAnchor: 'bottom',
                iconIgnorePlacement: true,
                iconImage: ALPR_SYMBOL_IMAGE_NAME,
                iconOffset: ALPR_SYMBOL_ICON_OFFSET,
                iconPitchAlignment: 'viewport',
                iconRotationAlignment: 'viewport',
                iconSize: ALPR_SYMBOL_ICON_SIZE_EXPRESSION,
            }}
        />,
    ];
}

function makeE2EMarkerTapTargetFeature(marker, index) {
    const coordinate = getMarkerCoordinate(marker);

    if (!coordinate) {
        return null;
    }

    const markerId = marker?.properties?.id ?? marker?.id ?? `marker-${index}`;

    return {
        type: 'Feature',
        id: markerId,
        geometry: {
            type: 'Point',
            coordinates: coordinate,
        },
        properties: {
            ...(marker?.properties ?? {}),
            markerId: String(markerId),
        },
    };
}

export const MapCanvas = memo(function MapCanvas() {
    const {
        handleCameraChanged,
        handleMapLoaded,
        handleMapPress,
        handleMarkerSourcePress,
        handleSubmittedSearchResultPress,
        cameraRef,
        directionsDebugFeatureCollection,
        directionsRouteFeatureCollection,
        e2eMapApiMocksEnabled,
        hideCompassDuringNavigation,
        initialCameraSettings,
        isDrivingMode,
        isFollowing,
        locationAccessGranted,
        localityBoundary,
        mapboxAttributionPosition,
        mapboxLogoPosition,
        mapCompassPosition,
        mapLightPreset,
        mapPreferencesAreLoaded,
        mapStyleURL,
        mapTrafficEnabled,
        surveillanceMarkersVisible,
        markerClustersEnabled,
        cameraConesVisible,
        mapViewRef,
        markerFeatureCollection,
        markerShapeSourceRef,
        nativeCameraFollowProps,
        navigationPuckVariant,
        policeAlertFeatureCollection,
        policeAlertsVisible,
        preferredFramesPerSecond = MAP_PREFERRED_FRAMES_PER_SECOND,
        submittedSearchResults,
        usesSharedLocationProvider = false,
    } = useMapCanvasContext();
    const {
        directionsWaypointMarkers,
        handleSelectedPlaceMarkerPress,
        selectedPlaceCoordinate,
    } = usePlaceSheetContext();
    const directionsRouteIsVisible =
        directionsRouteFeatureCollection?.features?.length > 0;
    const policeAlertsAreVisible = Boolean(
        policeAlertsVisible && policeAlertFeatureCollection?.features?.length,
    );
    const directionsDebugGeometryIsVisible =
        directionsDebugFeatureCollection?.features?.length > 0;
    const localityBoundaryIsVisible = Boolean(
        localityBoundary?.boundary?.features?.length,
    );
    const directionsWaypointCoordinateKeys = useMemo(
        () =>
            new Set(
                (directionsWaypointMarkers ?? [])
                    .map((marker) => getCoordinateKey(marker.coordinate))
                    .filter(Boolean),
            ),
        [directionsWaypointMarkers],
    );
    const selectedPlaceMarkerIsVisible = Boolean(
        selectedPlaceCoordinate &&
        !directionsWaypointCoordinateKeys.has(
            getCoordinateKey(selectedPlaceCoordinate),
        ),
    );
    const e2eMarkerTapTargetsAreEnabled =
        e2eMapApiMocksEnabled || mapApiMocksAreEnabled();
    const e2eMarkerTapTargetFeatures = e2eMarkerTapTargetsAreEnabled
        ? getMockMarkerPointsSnapshot()
              .map(makeE2EMarkerTapTargetFeature)
              .filter(Boolean)
        : [];
    const styleImportConfig = useMemo(
        () => ({
            ...MAPBOX_STANDARD_DRIVING_BASEMAP_CONFIG,
            lightPreset: mapLightPreset,
        }),
        [mapLightPreset],
    );
    const isDuskNightMapLightPreset =
        mapLightPreset === MAPBOX_STANDARD_LIGHT_PRESET_DUSK ||
        mapLightPreset === MAPBOX_STANDARD_LIGHT_PRESET_NIGHT;
    const mapOverlayEmissiveStrength = isDuskNightMapLightPreset ? 1 : 0;
    const mapRoutePalette = isDuskNightMapLightPreset
        ? MAP_ROUTE_PALETTES.duskNight
        : MAP_ROUTE_PALETTES.light;
    const markerClusteredSourceID = 'map-markers-clustered-source';
    const markerUnclusteredSourceID = 'map-markers-unclustered-source';
    const selectedDirectionsRouteColorExpression = useMemo(
        () => makeSelectedDirectionsRouteColorExpression(mapRoutePalette),
        [mapRoutePalette],
    );
    const drivingCameraFollowMode = Mapbox.UserTrackingMode.FollowWithHeading;
    const puckBearing = isDrivingMode
        ? 'heading'
        : !isFollowing
          ? 'heading'
          : 'course';
    const resolvedNavigationPuckVariant = navigationPuckVariant || 'default';
    const navigationPuckIsVisible = shouldShowNavigationPuck({
        isFollowing,
        navigationPuckVariant: resolvedNavigationPuckVariant,
    });
    const usesAutoPlayNavigationPuckImages =
        shouldUseAutoPlayNavigationPuckImages(resolvedNavigationPuckVariant);
    const navigationPuckBearingImage = usesAutoPlayNavigationPuckImages
        ? ANDROID_AUTO_NAVIGATION_PUCK_BEARING_IMAGE
        : NAVIGATION_PUCK_BEARING_IMAGE;
    const navigationPuckShadowImage = usesAutoPlayNavigationPuckImages
        ? ANDROID_AUTO_NAVIGATION_PUCK_SHADOW_IMAGE
        : NAVIGATION_PUCK_SHADOW_IMAGE;
    // iOS Fabric never applies image props back to undefined (rnmapbox
    // FabricOptionalProp limitation), so switching between the navigation
    // arrow and the default dot requires remounting the puck there. Android
    // clears null image props correctly, so it keeps the update-in-place path.
    const locationPuckKey =
        Platform.OS === 'ios'
            ? `location-puck-${navigationPuckIsVisible ? 'navigation' : 'default'}`
            : 'location-puck';
    const mapboxBrandingIsVisible = !isDrivingMode;

    if (!mapPreferencesAreLoaded) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-200 dark:bg-neutral-900">
                <ActivityIndicator color="#6b7280" size="small" />
            </View>
        );
    }

    if (!MAPBOX_ACCESS_TOKEN) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-200 px-6 dark:bg-neutral-900">
                <Text className="text-center text-sm font-semibold leading-5 text-neutral-600 dark:text-neutral-300">
                    Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to load the Mapbox map.
                </Text>
            </View>
        );
    }

    return (
        <NativeWindMapView
            attributionEnabled={mapboxBrandingIsVisible}
            attributionPosition={mapboxAttributionPosition}
            className="flex-1"
            ref={mapViewRef}
            scaleBarEnabled={false}
            logoEnabled={mapboxBrandingIsVisible}
            logoPosition={mapboxLogoPosition}
            compassEnabled={isDrivingMode && !hideCompassDuringNavigation}
            compassPosition={mapCompassPosition}
            onCameraChanged={handleCameraChanged}
            onDidFinishLoadingMap={handleMapLoaded}
            onPress={handleMapPress}
            preferredFramesPerSecond={preferredFramesPerSecond}
            styleURL={mapStyleURL}
        >
            <Mapbox.StyleImport
                key={`${MAPBOX_STANDARD_STYLE_IMPORT_ID}-${mapStyleURL}`}
                config={styleImportConfig}
                existing
                id={MAPBOX_STANDARD_STYLE_IMPORT_ID}
            />
            {locationAccessGranted &&
            (isDrivingMode || usesSharedLocationProvider) ? (
                <MapLocationProvider
                    isDrivingMode={isDrivingMode}
                    usesSharedLocationProvider={usesSharedLocationProvider}
                />
            ) : null}
            <Mapbox.Camera
                ref={cameraRef}
                defaultSettings={initialCameraSettings}
                followPadding={nativeCameraFollowProps?.padding}
                followPitch={nativeCameraFollowProps?.pitch}
                followUserLocation={nativeCameraFollowProps?.enabled ?? false}
                followUserMode={drivingCameraFollowMode}
                followZoomLevel={nativeCameraFollowProps?.zoomLevel}
                maxZoomLevel={MAX_ZOOM_LEVEL}
                minZoomLevel={MIN_ZOOM_LEVEL}
            />
            {mapTrafficEnabled ? (
                <Mapbox.VectorSource
                    id={MAPBOX_TRAFFIC_SOURCE_ID}
                    url={MAPBOX_TRAFFIC_SOURCE_URL}
                >
                    <Mapbox.LineLayer
                        id="map-traffic-congestion"
                        filter={TRAFFIC_OPEN_ROADS_FILTER}
                        minZoomLevel={6}
                        slot="middle"
                        sourceLayerID={MAPBOX_TRAFFIC_SOURCE_LAYER_ID}
                        style={{
                            lineCap: 'round',
                            lineColor: TRAFFIC_CONGESTION_COLOR_EXPRESSION,
                            lineJoin: 'round',
                            lineOffset:
                                TRAFFIC_DIRECTION_LINE_OFFSET_EXPRESSION,
                            lineOpacity: 0.88,
                            lineWidth: TRAFFIC_LINE_WIDTH_EXPRESSION,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="map-traffic-closures"
                        filter={TRAFFIC_CLOSED_ROADS_FILTER}
                        minZoomLevel={6}
                        slot="middle"
                        sourceLayerID={MAPBOX_TRAFFIC_SOURCE_LAYER_ID}
                        style={{
                            lineCap: 'round',
                            lineColor: '#0B0E12',
                            lineDasharray: [0.4, 1.2],
                            lineJoin: 'round',
                            lineOffset:
                                TRAFFIC_DIRECTION_LINE_OFFSET_EXPRESSION,
                            lineOpacity: 0.92,
                            lineWidth: TRAFFIC_LINE_WIDTH_EXPRESSION,
                        }}
                    />
                </Mapbox.VectorSource>
            ) : null}
            {directionsDebugGeometryIsVisible ? (
                <Mapbox.ShapeSource
                    id="directions-debug-source"
                    shape={directionsDebugFeatureCollection}
                >
                    <Mapbox.FillLayer
                        id="directions-debug-search-zone-fill"
                        filter={DIRECTIONS_DEBUG_SEARCH_ZONE_FILTER}
                        slot="top"
                        style={{
                            fillColor: '#FFB02E',
                            fillOpacity: 0.12,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-debug-search-zone-outline"
                        filter={DIRECTIONS_DEBUG_SEARCH_ZONE_FILTER}
                        slot="top"
                        style={{
                            lineColor: '#E5901A',
                            lineDasharray: [1.2, 1],
                            lineOpacity: 0.86,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                1,
                                12,
                                2,
                                18,
                                4,
                            ],
                        }}
                    />
                    <Mapbox.FillLayer
                        id="directions-debug-avoid-polygons-fill"
                        filter={DIRECTIONS_DEBUG_AVOID_POLYGONS_FILTER}
                        slot="top"
                        style={{
                            fillColor: '#FF4D4F',
                            fillOpacity: 0.2,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-debug-avoid-polygons-outline"
                        filter={DIRECTIONS_DEBUG_AVOID_POLYGONS_FILTER}
                        slot="top"
                        style={{
                            lineColor: '#E5383B',
                            lineOpacity: 0.94,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                1,
                                12,
                                2,
                                18,
                                4.5,
                            ],
                        }}
                    />
                    <Mapbox.FillLayer
                        id="directions-debug-endpoint-buffers-fill"
                        filter={DIRECTIONS_DEBUG_ENDPOINT_BUFFERS_FILTER}
                        slot="top"
                        style={{
                            fillColor: '#7A5CFF',
                            fillOpacity: 0.22,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-debug-endpoint-buffers-outline"
                        filter={DIRECTIONS_DEBUG_ENDPOINT_BUFFERS_FILTER}
                        slot="top"
                        style={{
                            lineColor: '#6244E5',
                            lineDasharray: [0.6, 0.6],
                            lineOpacity: 0.96,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                1,
                                12,
                                2,
                                18,
                                4,
                            ],
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-debug-destination-line"
                        filter={DIRECTIONS_DEBUG_DESTINATION_LINE_FILTER}
                        slot="top"
                        style={{
                            lineColor: '#7A5CFF',
                            lineDasharray: [0.8, 1.2],
                            lineOpacity: 0.9,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                1.5,
                                12,
                                3,
                                18,
                                6,
                            ],
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {directionsRouteIsVisible ? (
                <Mapbox.ShapeSource
                    id="directions-route-source"
                    shape={directionsRouteFeatureCollection}
                >
                    <Mapbox.LineLayer
                        id="directions-route-alternate-casing"
                        filter={ALTERNATE_DIRECTIONS_ROUTE_FILTER}
                        slot="top"
                        style={{
                            lineCap: 'round',
                            lineColor: mapRoutePalette.alternateCasing,
                            lineEmissiveStrength: isDuskNightMapLightPreset
                                ? 1
                                : 0,
                            lineJoin: 'round',
                            lineOpacity: isDuskNightMapLightPreset
                                ? 0.88
                                : 0.72,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                5,
                                12,
                                7,
                                18,
                                12,
                            ],
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-route-alternate-line"
                        filter={ALTERNATE_DIRECTIONS_ROUTE_FILTER}
                        slot="top"
                        style={{
                            lineCap: 'round',
                            lineColor: mapRoutePalette.alternateLine,
                            lineEmissiveStrength: isDuskNightMapLightPreset
                                ? 1
                                : 0,
                            lineJoin: 'round',
                            lineOpacity: isDuskNightMapLightPreset ? 0.8 : 0.68,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                2.5,
                                12,
                                4,
                                18,
                                7,
                            ],
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-route-casing"
                        filter={SELECTED_DIRECTIONS_ROUTE_FILTER}
                        slot="top"
                        style={{
                            lineCap: 'round',
                            lineColor: mapRoutePalette.selectedCasing,
                            lineEmissiveStrength: isDuskNightMapLightPreset
                                ? 1
                                : 0,
                            lineJoin: 'round',
                            lineOpacity: isDuskNightMapLightPreset
                                ? 0.96
                                : 0.92,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                6,
                                12,
                                9,
                                18,
                                15,
                            ],
                        }}
                    />
                    <Mapbox.LineLayer
                        id="directions-route-line"
                        filter={SELECTED_DIRECTIONS_ROUTE_FILTER}
                        slot="top"
                        style={{
                            lineCap: 'round',
                            lineColor: selectedDirectionsRouteColorExpression,
                            lineEmissiveStrength: isDuskNightMapLightPreset
                                ? 1
                                : 0,
                            lineJoin: 'round',
                            lineOpacity: isDuskNightMapLightPreset ? 1 : 0.94,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                3.5,
                                12,
                                5.5,
                                18,
                                10,
                            ],
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {localityBoundaryIsVisible ? (
                <Mapbox.ShapeSource
                    id="locality-boundary-source"
                    shape={localityBoundary.boundary}
                >
                    <Mapbox.FillLayer
                        id="locality-boundary-fill"
                        slot="middle"
                        style={{
                            fillColor: '#1FBF6B',
                            fillOpacity: 0.08,
                        }}
                    />
                    <Mapbox.LineLayer
                        id="locality-boundary-outline"
                        slot="top"
                        style={{
                            lineColor: '#0F7D45',
                            lineDasharray: [1.5, 0.75],
                            lineOpacity: 0.82,
                            lineWidth: [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                4,
                                1,
                                12,
                                2,
                                18,
                                4,
                            ],
                        }}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {surveillanceMarkersVisible && cameraConesVisible ? (
                <MarkerConeImages />
            ) : null}
            {surveillanceMarkersVisible ? <AlprMarkerImages /> : null}
            {policeAlertsAreVisible ? <PoliceAlertImages /> : null}
            {surveillanceMarkersVisible && markerClustersEnabled ? (
                <Mapbox.ShapeSource
                    id={markerClusteredSourceID}
                    ref={markerShapeSourceRef}
                    cluster
                    clusterMaxZoomLevel={MARKER_CLUSTER_MAX_ZOOM_LEVEL}
                    clusterRadius={MARKER_CLUSTER_RADIUS}
                    hitbox={{ height: 48, width: 48 }}
                    onPress={handleMarkerSourcePress}
                    shape={markerFeatureCollection}
                >
                    {[
                        ...(cameraConesVisible
                            ? renderMarkerConeLayers({
                                  idPrefix: 'map-markers-clustered',
                                  sourceID: markerClusteredSourceID,
                                  visible: true,
                              })
                            : []),
                        ...renderMarkerClusterLayers({
                            emissiveStrength: mapOverlayEmissiveStrength,
                            idPrefix: 'map-markers-clustered',
                            mapRoutePalette,
                            sourceID: markerClusteredSourceID,
                        }),
                        ...renderMarkerPointLayers({
                            emissiveStrength: mapOverlayEmissiveStrength,
                            idPrefix: 'map-markers-clustered',
                            mapRoutePalette,
                            sourceID: markerClusteredSourceID,
                        }),
                    ]}
                </Mapbox.ShapeSource>
            ) : null}
            {surveillanceMarkersVisible && !markerClustersEnabled ? (
                <Mapbox.ShapeSource
                    id={markerUnclusteredSourceID}
                    hitbox={{ height: 48, width: 48 }}
                    onPress={handleMarkerSourcePress}
                    shape={markerFeatureCollection}
                >
                    {[
                        ...(cameraConesVisible
                            ? renderMarkerConeLayers({
                                  idPrefix: 'map-markers-unclustered',
                                  sourceID: markerUnclusteredSourceID,
                                  visible: true,
                              })
                            : []),
                        ...renderMarkerPointLayers({
                            emissiveStrength: mapOverlayEmissiveStrength,
                            idPrefix: 'map-markers-unclustered',
                            mapRoutePalette,
                            sourceID: markerUnclusteredSourceID,
                        }),
                    ]}
                </Mapbox.ShapeSource>
            ) : null}
            {policeAlertsAreVisible ? (
                <Mapbox.ShapeSource
                    id="police-alerts-source"
                    shape={policeAlertFeatureCollection}
                >
                    <Mapbox.CircleLayer
                        id="police-alert-halos"
                        style={POLICE_ALERT_HALO_LAYER_STYLE}
                    />
                    <Mapbox.SymbolLayer
                        id="police-alert-symbols"
                        style={POLICE_ALERT_SYMBOL_LAYER_STYLE}
                    />
                </Mapbox.ShapeSource>
            ) : null}
            {(directionsWaypointMarkers ?? []).map((marker) => (
                <RouteWaypointMarker key={marker.id} marker={marker} />
            ))}
            {locationAccessGranted ? (
                <>
                    <NavigationPuckImages />
                    <Mapbox.LocationPuck
                        key={locationPuckKey}
                        bearingImage={
                            navigationPuckIsVisible
                                ? navigationPuckBearingImage
                                : undefined
                        }
                        puckBearing={puckBearing}
                        puckBearingEnabled
                        shadowImage={
                            navigationPuckIsVisible
                                ? navigationPuckShadowImage
                                : undefined
                        }
                        topImage={
                            navigationPuckIsVisible
                                ? NAVIGATION_PUCK_TOP_TRANSPARENT_IMAGE
                                : undefined
                        }
                        visible
                    />
                </>
            ) : null}
            {surveillanceMarkersVisible
                ? e2eMarkerTapTargetFeatures.map((feature, index) => (
                      <E2EMarkerTapTarget
                          key={`e2e-marker-${feature.id ?? index}`}
                          feature={feature}
                          index={index}
                          onPress={handleMarkerSourcePress}
                      />
                  ))
                : null}
            {(submittedSearchResults ?? []).map((result, index) => (
                <SubmittedSearchResultMarker
                    key={`submitted-search-result-${result.id}-${index}`}
                    index={index}
                    onPress={handleSubmittedSearchResultPress}
                    result={result}
                />
            ))}
            {selectedPlaceMarkerIsVisible ? (
                <Mapbox.MarkerView
                    allowOverlap
                    allowOverlapWithPuck
                    anchor={{ x: 0.5, y: 1 }}
                    coordinate={selectedPlaceCoordinate}
                >
                    <Pressable
                        accessibilityLabel="Selected place marker"
                        accessibilityRole="button"
                        className="h-16 w-14 items-center justify-start"
                        hitSlop={8}
                        onPress={handleSelectedPlaceMarkerPress}
                    >
                        <Svg height={58} viewBox="0 0 48 58" width={48}>
                            <Path
                                d="M24 56C21.5 51.9 7 36.4 7 23.5C7 13.9 14.6 6 24 6C33.4 6 41 13.9 41 23.5C41 36.4 26.5 51.9 24 56Z"
                                fill="#7A5CFF"
                                stroke="#ffffff"
                                strokeWidth={3}
                            />
                            <Circle cx={24} cy={23} fill="#ffffff" r={8.5} />
                            <Circle cx={24} cy={23} fill="#7A5CFF" r={4} />
                        </Svg>
                    </Pressable>
                </Mapbox.MarkerView>
            ) : null}
        </NativeWindMapView>
    );
});
