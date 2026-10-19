import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    corridorSourceLabel,
    getCorridorSource,
    subscribeCorridorSource,
} from './road-corridor-source';

export function RoadCorridorStatus() {
    const source = useSyncExternalStore(
        subscribeCorridorSource,
        getCorridorSource,
        getCorridorSource,
    );
    const insets = useSafeAreaInsets();
    return (
        <View
            pointerEvents="none"
            className="absolute left-3 right-3 rounded-lg bg-slate-950/90 px-3 py-2"
            style={{ bottom: insets.bottom + 110 }}
        >
            <Text
                testID="road-corridor-source"
                accessibilityLabel={corridorSourceLabel(source)}
                className="text-xs font-medium text-white"
            >
                {corridorSourceLabel(source)}
            </Text>
        </View>
    );
}
