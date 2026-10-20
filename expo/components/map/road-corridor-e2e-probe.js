import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import {
    getCorridorSource,
    subscribeCorridorSource,
} from './road-corridor-source';
import { mapApiMocksAreEnabled } from './api-mocks';

export function RoadCorridorE2EProbe({ location, roadLookAhead }) {
    const source = useSyncExternalStore(
        subscribeCorridorSource,
        getCorridorSource,
        getCorridorSource,
    );
    return (
        <View
            pointerEvents="none"
            className="absolute left-1 top-32 z-50 bg-black p-1"
        >
            <Text className="text-xs text-white" testID="e2e-corridor-source">
                {source.source}
            </Text>
            <Text className="text-xs text-white" testID="e2e-corridor-reason">
                {source.reason ?? 'none'}
            </Text>
            <Text className="text-xs text-white" testID="e2e-corridor-mocks">
                {String(mapApiMocksAreEnabled())}
            </Text>
            <Text className="text-xs text-white" testID="e2e-corridor-matched">
                {String(location?.roadMatch?.isOffRoad === false)}
            </Text>
            <Text className="text-xs text-white" testID="e2e-corridor-latitude">
                {String(location?.latitude ?? '')}
            </Text>
            <Text
                className="text-xs text-white"
                testID="e2e-corridor-longitude"
            >
                {String(location?.longitude ?? '')}
            </Text>
            <Text
                className="text-xs text-white"
                testID="e2e-corridor-speed-limit"
            >
                {String(location?.roadMatch?.speedLimit?.speedLimitMph ?? '')}
            </Text>
            <Text
                className="text-xs text-white"
                testID="e2e-corridor-look-ahead"
            >
                {String(roadLookAhead?.primaryPath?.segments?.length ?? 0)}
            </Text>
            <Text className="text-xs text-white" testID="e2e-corridor-edge">
                {String(location?.roadMatch?.edgeId ?? '')}
            </Text>
        </View>
    );
}
