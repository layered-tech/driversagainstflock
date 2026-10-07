import { Image, View } from 'react-native';
import { MapControlIcon } from './map-control-icon';

export function MapLayersIcon({ color, layerKey }) {
    const isSatellite = layerKey === 'standard-satellite';
    const iconColor = color ?? (isSatellite ? '#1FBF6B' : '#171717');

    return <MapControlIcon color={iconColor} name="sliders-horizontal" />;
}

export function MapLayerPreview({ mapLayer }) {
    return (
        <View className="h-full w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900">
            <Image
                accessibilityIgnoresInvertColors
                className="h-full w-full"
                resizeMode="cover"
                source={mapLayer.previewImageSource}
            />
        </View>
    );
}
