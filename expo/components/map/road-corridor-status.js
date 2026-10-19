import { useEffect, useSyncExternalStore } from 'react';
import { Switch, Text, View } from 'react-native';
import {
    corridorSourceLabel,
    getCorridorSource,
    subscribeCorridorSource,
} from './road-corridor-source';

import {
    getCorridorRelease,
    initializeCorridorReleases,
    setCorridorServiceOnly,
    subscribeCorridorRelease,
} from './road-corridor-pilot';

export function RoadCorridorStatus() {
    useEffect(() => {
        void initializeCorridorReleases();
    }, []);
    const release = useSyncExternalStore(
        subscribeCorridorRelease,
        getCorridorRelease,
        getCorridorRelease,
    );
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
            <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-sm text-neutral-950 dark:text-white">
                    Use existing corridor service
                </Text>
                <Switch
                    testID="road-corridor-service-only"
                    accessibilityLabel="Use existing corridor service"
                    value={release.forceService}
                    onValueChange={(value) => {
                        void setCorridorServiceOnly(value);
                    }}
                />
            </View>
            <Text className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                {`Saved release: ${release.release}${release.previousRelease ? `\nPrevious: ${release.previousRelease}` : ''}${!release.enabled ? '\nDownloads disabled by server' : ''}${release.error ? `\n${release.error}` : ''}`}
            </Text>
        </View>
    );
}
