import Mapbox from '@rnmapbox/maps';
import { Image, Platform } from 'react-native';
import { MARKER_CONE_DIRECTION_PROPERTY_NAMES } from './constants';

const MODEL_ID = 'camera-view-cone';
const MODELS = {
    [MODEL_ID]: resolveModelAsset(
        require('../../assets/map/camera-view-cone.glb'),
    ),
};

function resolveModelAsset(asset) {
    // Mapbox cannot open React Native's Android drawable/raw resource names.
    // The config plugin packages the GLB in AssetManager for every build type.
    if (Platform.OS === 'android') {
        return 'asset://camera-view-cone.glb';
    }
    const uri = Image.resolveAssetSource(asset)?.uri;
    if (!uri?.includes('/assets/?unstable_path=')) {
        return asset;
    }

    // RNMapbox strips model URL queries natively. Expo's development asset
    // path must be moved out of the query before that happens.
    const url = new URL(uri);
    const assetPath = url.searchParams.get('unstable_path').split('?')[0];
    const encodedPath = assetPath
        .replace(/^\.\//, '')
        .split('/')
        .map(encodeURIComponent)
        .join('/');
    return `${url.origin}${url.pathname}${encodedPath}`;
}

export function CameraViewConeModels() {
    return <Mapbox.Models models={MODELS} />;
}

export function CameraViewConeModelLayer({
    aboveLayerID,
    id,
    isDarkMode = false,
    sourceID,
    direction,
    directionProperty,
    slot,
}) {
    const rotationProperty = `${directionProperty}Rotation`;
    return (
        <Mapbox.ModelLayer
            aboveLayerID={aboveLayerID}
            id={id}
            sourceID={sourceID}
            slot={slot}
            style={{
                // The Android ModelLayer bridge does not apply feature filters.
                // An empty model ID also excludes clusters and unknown directions.
                modelId: directionProperty
                    ? [
                          'case',
                          [
                              'all',
                              ['!', ['has', 'point_count']],
                              ['has', rotationProperty],
                          ],
                          MODEL_ID,
                          '',
                      ]
                    : MODEL_ID,
                modelRotation: directionProperty
                    ? [
                          'coalesce',
                          ['get', rotationProperty],
                          ['literal', [0, 0, 0]],
                      ]
                    : [0, 0, direction],
                modelRotationTransition: { duration: 0, delay: 0 },
                modelAllowDensityReduction: false,
                modelScale: [1, 1, 1],
                modelTranslation: [0, 0, 2.5],
                modelType: 'location-indicator',
                modelOpacity: 1,
                modelEmissiveStrength: isDarkMode ? 1 : 0.95,
                modelCastShadows: false,
                modelReceiveShadows: false,
            }}
        />
    );
}

export function renderMarkerConeModelLayers({
    aboveLayerID,
    idPrefix,
    isDarkMode = false,
    sourceID,
    slot,
    visible = true,
}) {
    if (!visible) {
        return [];
    }

    return MARKER_CONE_DIRECTION_PROPERTY_NAMES.map((directionProperty) => (
        <CameraViewConeModelLayer
            key={`${idPrefix}-cone-${directionProperty}`}
            aboveLayerID={aboveLayerID}
            id={`${idPrefix}-cone-${directionProperty}`}
            isDarkMode={isDarkMode}
            sourceID={sourceID}
            slot={slot}
            directionProperty={directionProperty}
        />
    ));
}
