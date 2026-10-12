import Mapbox from '@rnmapbox/maps';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { useMapCanvasContext } from '../map/map-screen-context';
import { useContribute } from './contribute-state';

export function ContributeDraftPinMarkers() {
    const { contributePins, contributePlacementIsActive } =
        useMapCanvasContext();
    const { removals } = useContribute();
    if (!contributePlacementIsActive) return null;
    const markers = [
        ...(contributePins ?? []).map((pin, index) => ({
            ...pin,
            index,
            action: pin.nodeId ? 'edit' : 'add',
        })),
        ...removals.map((node) => ({
            ...node,
            id: `delete-${node.id}`,
            action: 'delete',
        })),
    ];
    return (
        <>
            {markers.map((pin) => (
                <Mapbox.MarkerView
                    key={pin.id}
                    allowOverlap
                    allowOverlapWithPuck
                    anchor={{ x: 0.5, y: 0.5 }}
                    coordinate={[pin.longitude, pin.latitude]}
                >
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                            pin.action === 'delete'
                                ? 'Staged deletion'
                                : 'Edit staged camera'
                        }
                        onPress={() => {
                            if (pin.action !== 'delete')
                                router.push(`/contribute/camera/${pin.index}`);
                        }}
                        testID={`contribute-draft-pin-${pin.index ?? pin.id}`}
                        className={`h-10 w-10 items-center justify-center rounded-full border-2 border-white ${pin.action === 'delete' ? 'bg-daf-marker-alpr/40' : 'bg-daf-marker-alpr'}`}
                    >
                        <Icon name="camera" color="#fff" size={20} />
                        <View
                            className={`absolute -right-1 -top-1 h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white ${pin.action === 'delete' ? 'bg-daf-alert' : 'bg-daf-brand'}`}
                        >
                            <Icon
                                name={
                                    pin.action === 'add'
                                        ? 'plus'
                                        : pin.action === 'edit'
                                          ? 'pencil'
                                          : 'minus'
                                }
                                color="#fff"
                                size={10}
                            />
                        </View>
                    </Pressable>
                </Mapbox.MarkerView>
            ))}
        </>
    );
}
