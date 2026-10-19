import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
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
    return (
        <View className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <Text
                testID="road-corridor-source"
                accessibilityLabel={corridorSourceLabel(source)}
                className="text-xs leading-5 text-neutral-950 dark:text-white"
                selectable
            >
                {corridorSourceLabel(source)}
            </Text>
        </View>
    );
}
