import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { DafIconButton } from '../design-system/primitives';
import { AreaMap } from './area-map';
import { AreaError, AreaLoading, AreaText as Text } from './area-ui';
import { areaRequest } from './areas-api';
import { mergeAreaChanges } from './area-geometry';
import { useAreas } from './areas-context';

export default function AreaChangesMapScreen() {
    const { areaId, window = '7', changeId } = useLocalSearchParams();
    const { areas, cachedAreas, rememberAreaBoundary } = useAreas();
    const savedArea =
        areas.find((item) => String(item.id) === String(areaId)) ??
        cachedAreas.find((item) => String(item.id) === String(areaId));
    const [changes, setChanges] = useState([]);
    const [loadedArea, setArea] = useState(null);
    const area =
        String(loadedArea?.id) === String(areaId)
            ? { ...savedArea, ...loadedArea }
            : savedArea;
    const selectedChange = changes.find(
        (change) => String(change.id) === String(changeId),
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const insets = useSafeAreaInsets();
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setChanges([]);
        (async () => {
            if (changeId) {
                const payload = await areaRequest(
                    `/${areaId}/changes/${changeId}`,
                    { signal: controller.signal },
                );
                if (controller.signal.aborted) return;
                setArea(payload.area);
                rememberAreaBoundary(payload.area);
                setChanges([payload.change]);
                return;
            }
            let page = 1;
            let lastPage = 1;
            do {
                const payload = await areaRequest(
                    `/${areaId}/changes?window=${window}&page=${page}`,
                    { signal: controller.signal },
                );
                if (controller.signal.aborted) return;
                setArea(payload.area);
                rememberAreaBoundary(payload.area);
                setChanges((current) =>
                    mergeAreaChanges(current, payload.changes.data),
                );
                lastPage = payload.changes.last_page;
                page++;
            } while (page <= lastPage);
        })()
            .catch((failure) => {
                if (!controller.signal.aborted) setError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [areaId, window, changeId, attempt, rememberAreaBoundary]);
    return (
        <View className="flex-1" testID="area-changes-map-screen">
            {(changeId ? selectedChange : area?.geometry) ? (
                <AreaMap
                    key={areaId}
                    zoomLevel={changeId ? 16 : 12}
                    fitGeometry={!changeId}
                    geometry={area?.geometry}
                    center={
                        selectedChange
                            ? [
                                  selectedChange.longitude,
                                  selectedChange.latitude,
                              ]
                            : undefined
                    }
                    changes={changes}
                    onChangePress={(id) =>
                        router.push(`/areas/${areaId}/change?changeId=${id}`)
                    }
                />
            ) : (
                <View className="flex-1 items-center justify-center">
                    <AreaLoading />
                </View>
            )}
            <View
                className="absolute left-3 right-3 flex-row items-center gap-3"
                style={{ top: insets.top + 8 }}
            >
                <DafIconButton
                    icon="chevron-left"
                    accessibilityLabel="Back"
                    onPress={() => router.back()}
                />
                <View className="min-w-0 flex-1 rounded-dafPill bg-white px-4 py-3 dark:bg-daf-surface-dark">
                    <Text
                        className="text-[15px] font-semibold text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                    >
                        {area?.name ?? 'Area changes'}
                    </Text>
                    <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                        {changes.length} changes · red added · green removed
                    </Text>
                </View>
            </View>
            <View className="absolute bottom-10 left-4 right-4">
                {loading && (changeId ? selectedChange : area?.geometry) ? (
                    <AreaLoading />
                ) : null}
                <AreaError
                    message={error}
                    onRetry={() => setAttempt((value) => value + 1)}
                />
            </View>
        </View>
    );
}
