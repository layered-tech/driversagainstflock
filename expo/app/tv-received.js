import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from '../lib/safe-area-insets';
import { AreaMap } from '../components/areas/area-map';
import { DuoText as Text } from '../components/design-system/duo-typography';
import { DafButton } from '../components/design-system/primitives';
import {
    getTvState,
    subscribeTv,
} from '../components/tv/tv-runtime';
import { tvActionPlace } from '../components/tv/tv-actions';

export default function TvReceivedScreen() {
    const { actionId } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const state = useSyncExternalStore(subscribeTv, getTvState, getTvState);
    const action = state.actions.find((item) => item.id === actionId);
    const place = tvActionPlace(action);
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-daf-surface-inverse"
            style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
            <View className="gap-3 p-5">
                <Text className="font-dafDisplay text-[24px] font-bold text-daf-text-primary dark:text-daf-text-inverse">
                    From your TV
                </Text>
                <Text className="text-[18px] text-daf-text-primary dark:text-daf-text-inverse">
                    {place?.name ??
                        'This shared place has expired or is unavailable.'}
                </Text>
                <DafButton variant="secondary" onPress={() => router.back()}>
                    Back
                </DafButton>
            </View>
            {place ? (
                <>
                    <View className="min-h-64 flex-1 overflow-hidden">
                        <AreaMap
                            center={[place.longitude, place.latitude]}
                            zoomLevel={15}
                            changes={[
                                {
                                    id: action.id,
                                    longitude: place.longitude,
                                    latitude: place.latitude,
                                    kind: 'added',
                                },
                            ]}
                        />
                    </View>
                    <View className="gap-3 p-5">
                        {action.type === 'watch-camera' ? (
                            <DafButton
                                variant="secondary"
                                onPress={() =>
                                    router.push({
                                        pathname: '/areas/add',
                                        params: {
                                            mode: 'around',
                                            latitude: String(place.latitude),
                                            longitude: String(place.longitude),
                                            name: place.name,
                                        },
                                    })
                                }
                            >
                                Watch this area
                            </DafButton>
                        ) : null}
                    </View>
                </>
            ) : null}
        </View>
    );
}
